/**
 * Email Myself — a Google Apps Script web app that sends emails to your own
 * Gmail address, either right away or on a schedule (once or repeating).
 *
 * Scheduled emails are stored in Script Properties. A single time-driven
 * trigger checks every few minutes for emails that are due and sends them.
 * The trigger is created when you schedule your first email and removed
 * again once nothing is left to send.
 */

const KEY_PREFIX = 'email_';
const TRIGGER_HANDLER = 'processDueEmails';
const CHECK_EVERY_MINUTES = 1; // Allowed values: 1, 5, 10, 15, 30
const REPEATS = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'perday'];
const DAILY_SEND_LIMIT = 100; // Gmail's daily Apps Script limit for free accounts
const MIN_GAP_MINUTES = 5; // Shortest spacing allowed for "several times a day"
const MAX_SUBJECT = 250;
const MAX_BODY = 5000; // Keeps each stored email under the 9 KB property limit

// ---------------------------------------------------------------------------
// Web app entry point
// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Email Myself')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

// ---------------------------------------------------------------------------
// Functions called from the page via google.script.run
// ---------------------------------------------------------------------------

function getMyAddress() {
  return Session.getEffectiveUser().getEmail();
}

function sendNow(subject, body) {
  validate_(subject, body);
  GmailApp.sendEmail(getMyAddress(), subject, body);
  return true;
}

function scheduleEmail(item) {
  validate_(item.subject, item.body);
  if (REPEATS.indexOf(item.repeat) === -1) throw new Error('Unknown repeat option.');

  const email = {
    id: Utilities.getUuid(),
    subject: item.subject,
    body: item.body,
    repeat: item.repeat,
  };

  if (item.repeat === 'perday') {
    // Spread evenly across a daily time window, forever (until cancelled).
    email.timesPerDay = Math.floor(Number(item.timesPerDay));
    email.fromMinute = Math.floor(Number(item.fromMinute));
    email.toMinute = Math.floor(Number(item.toMinute));
    validatePerDay_(email);
    email.sendAt = nextSlot_(Date.now(), email);
  } else {
    email.sendAt = Number(item.sendAt);
    if (!email.sendAt) throw new Error('Pick a date and time.');
    if (item.repeat === 'none' && email.sendAt <= Date.now()) {
      throw new Error('That time is in the past.');
    }
    email.dayOfMonth = new Date(email.sendAt).getDate();
  }

  withLock_(function () {
    const perDay = readAll_().reduce(function (sum, e) { return sum + emailsPerDay_(e); }, 0);
    if (perDay + emailsPerDay_(email) > DAILY_SEND_LIMIT) {
      throw new Error('That would go over Gmail\'s limit of ' + DAILY_SEND_LIMIT +
        ' emails a day (already scheduled: about ' + perDay + ' a day).');
    }
    store_().setProperty(KEY_PREFIX + email.id, JSON.stringify(email));
  });
  ensureTrigger_();
  return email;
}

function listScheduled() {
  return readAll_().sort(function (a, b) { return a.sendAt - b.sendAt; });
}

function cancelScheduled(id) {
  withLock_(function () {
    store_().deleteProperty(KEY_PREFIX + id);
  });
  if (readAll_().length === 0) removeTrigger_();
  return true;
}

// ---------------------------------------------------------------------------
// Trigger handler: sends whatever is due
// ---------------------------------------------------------------------------

function processDueEmails() {
  withLock_(function () {
    const now = Date.now();
    readAll_().forEach(function (email) {
      if (email.sendAt > now) return;

      try {
        GmailApp.sendEmail(getMyAddress(), email.subject, email.body);
      } catch (err) {
        // Leave it in place so the next run retries.
        console.error('Failed to send "' + email.subject + '": ' + err);
        return;
      }

      if (email.repeat === 'none') {
        store_().deleteProperty(KEY_PREFIX + email.id);
        return;
      }
      // Skip any occurrences missed while the trigger wasn't running,
      // so a long gap never causes a burst of duplicate emails.
      let next = nextTime_(email.sendAt, email);
      while (next <= now) next = nextTime_(next, email);
      email.sendAt = next;
      store_().setProperty(KEY_PREFIX + email.id, JSON.stringify(email));
    });
  });
  if (readAll_().length === 0) removeTrigger_();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Next occurrence after `ms`. Uses the script's time zone (Project Settings). */
function nextTime_(ms, email) {
  if (email.repeat === 'perday') return nextSlot_(ms, email);
  const d = new Date(ms);
  switch (email.repeat) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekdays':
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly': {
      // Keep the original day of month, clamped for shorter months (e.g. the 31st).
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(email.dayOfMonth, daysInMonth));
      break;
    }
  }
  return d.getTime();
}

/**
 * First slot strictly after `after` for a "several times a day" email.
 * Slots are evenly spaced across the window [fromMinute, toMinute) each day;
 * from == to means the whole day, and to < from wraps past midnight.
 */
function nextSlot_(after, email) {
  const gap = windowMinutes_(email) / email.timesPerDay;
  const base = new Date(after);
  // Start from yesterday so a window that runs past midnight is covered.
  for (let day = -1; day <= 1; day++) {
    for (let i = 0; i < email.timesPerDay; i++) {
      const t = new Date(base.getFullYear(), base.getMonth(), base.getDate() + day,
        0, Math.round(email.fromMinute + i * gap)).getTime();
      if (t > after) return t;
    }
  }
  throw new Error('Could not find the next send time.');
}

function windowMinutes_(email) {
  return (email.toMinute - email.fromMinute + 1440) % 1440 || 1440;
}

function validatePerDay_(email) {
  const n = email.timesPerDay;
  if (!(n >= 1 && n <= DAILY_SEND_LIMIT)) {
    throw new Error('Times per day must be between 1 and ' + DAILY_SEND_LIMIT + '.');
  }
  [email.fromMinute, email.toMinute].forEach(function (m) {
    if (!(m >= 0 && m < 1440)) throw new Error('Pick valid start and end times.');
  });
  if (windowMinutes_(email) / n < MIN_GAP_MINUTES) {
    throw new Error('Too many emails for that time window (keep them at least ' +
      MIN_GAP_MINUTES + ' minutes apart).');
  }
}

/** Roughly how many emails a schedule sends per day, for the quota check. */
function emailsPerDay_(email) {
  if (email.repeat === 'perday') return email.timesPerDay;
  return email.repeat === 'none' ? 0 : 1;
}

function validate_(subject, body) {
  if (!subject || !String(subject).trim()) throw new Error('Add a subject.');
  if (String(subject).length > MAX_SUBJECT) {
    throw new Error('Subject is too long (max ' + MAX_SUBJECT + ' characters).');
  }
  if (String(body || '').length > MAX_BODY) {
    throw new Error('Message is too long (max ' + MAX_BODY + ' characters).');
  }
}

function store_() {
  return PropertiesService.getScriptProperties();
}

function readAll_() {
  const all = store_().getProperties();
  return Object.keys(all)
    .filter(function (key) { return key.indexOf(KEY_PREFIX) === 0; })
    .map(function (key) { return JSON.parse(all[key]); });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function ensureTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === TRIGGER_HANDLER;
  });
  if (!exists) {
    ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(CHECK_EVERY_MINUTES).create();
  }
}

function removeTrigger_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === TRIGGER_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

/** Run this once from the editor to grant permissions and get a test email. */
function setup() {
  GmailApp.sendEmail(getMyAddress(), 'Email Myself is set up', 'It works! 🎉');
  console.log('Test email sent to ' + getMyAddress());
}
