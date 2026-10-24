# Email Myself

A small Google Apps Script web app that sends emails to your own Gmail address, either right away or on a schedule (once, daily, on weekdays, weekly or monthly). Google's servers do the sending, so it works even when your phone is off. You use it from your iPhone like an app.

The code is in [`apps-script/`](apps-script):

- `Code.gs` is the server side. It sends the email, stores scheduled emails and runs the scheduler.
- `Index.html` is the mobile-friendly page you open on your phone.

## Setup (one time, about 5 minutes, easiest on a computer)

1. Go to <https://script.google.com> and click **New project**. Rename it "Email Myself".
2. **Code.gs:** replace everything in the default `Code.gs` with the contents of [`apps-script/Code.gs`](apps-script/Code.gs).
3. **Index.html:** click **+** next to *Files*, choose **HTML** and name it `Index` (the editor adds `.html`). Replace its contents with [`apps-script/Index.html`](apps-script/Index.html).
4. **Time zone:** open **Project Settings** (the gear icon) and make sure **Time zone** matches yours. Repeating emails use this time zone.
5. **Permissions:** back in the editor, choose `setup` in the function dropdown and click **Run**. Google asks for permission:
   - Click **Review permissions** and pick your account.
   - Google shows *"Google hasn't verified this app"*. That's expected, because it's your own script. Click **Advanced → Go to Email Myself (unsafe) → Allow**.
   - You should get a test email titled "Email Myself is set up".
6. **Deploy:** click **Deploy → New deployment**, then the gear next to *Select type*, then **Web app**:
   - **Execute as:** Me
   - **Who has access:** Only myself
   - Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

## Put it on your iPhone

1. Send yourself the Web app URL and open it in **Safari**. Sign in to Google if Safari asks.
2. Tap **Share → Add to Home Screen**.
3. Open it from the Home Screen icon from now on.

## Using it

- **Now** sends the email immediately.
- **Later** lets you pick a date, time and repeat option, then tap **Schedule**.
- **Scheduled** lists upcoming emails and when each one goes out next. Tap **Cancel** to stop one.

Scheduled emails arrive within about a minute of the chosen time. The scheduler only runs while something is scheduled.

## Updating the code later

After you paste in changes, click **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.

## Notes and limits

- With access set to **Only myself**, nobody else can open the page or send through it, and it only ever emails your own address.
- Free Gmail accounts can send up to about 100 emails a day from Apps Script.
- Subjects can be up to 250 characters and messages up to 5,000.
