# Google Calendar Sync - Quick Fix for 400 Error

## The 400 Error You're Seeing

"400. That's an error. The server cannot process the request because it is malformed."

This error means your OAuth configuration in Google Cloud Console is incorrect.

---

## ✅ QUICK FIX CHECKLIST

### 1. Check Your `.env` File
Open `.env` in your project root and verify:

```env
# ✅ CORRECT - Use Client ID only
VITE_GOOGLE_CLIENT_ID=************-********.apps.googleusercontent.com

# ❌ WRONG - Don't use Client Secret here!
VITE_GOOGLE_API_KEY=GOCSPX-********************************
```

**What you have now (from .env.example):**
- `VITE_GOOGLE_CLIENT_ID=************-****************************************.apps.googleusercontent.com` ✅ This looks correct!
- `VITE_GOOGLE_API_KEY=GOCSPX-...` ❌ This is a CLIENT SECRET, not an API key!

**ACTION**: Remove or comment out the `VITE_GOOGLE_API_KEY` line - it's not needed!

---

### 2. Fix Google Cloud Console OAuth Settings

Go to [Google Cloud Console](https://console.cloud.google.com/) → Your Project → APIs & Services → Credentials

Find your OAuth 2.0 Client ID and click the edit (pencil) icon.

#### ✅ Authorized JavaScript origins
Add EXACTLY these (no trailing slashes):
```
http://localhost:5173
http://127.0.0.1:5173
```

#### ✅ Authorized redirect URIs
Add EXACTLY these:
```
http://localhost:5173
http://127.0.0.1:5173
```

Click **SAVE** at the bottom!

---

### 3. Verify OAuth Consent Screen

Go to: APIs & Services → OAuth consent screen

✅ Check that:
- App is in "Testing" mode (or "Published" if ready)
- Your email is listed under "Test users"
- Scope `https://www.googleapis.com/auth/calendar` is added

---

### 4. Verify Calendar API is Enabled

Go to: APIs & Services → Library

- Search for "Google Calendar API"
- It should show "API enabled" (green checkmark)
- If not, click "ENABLE"

---

### 5. Restart Everything

```bash
# Stop dev server (Ctrl+C in terminal)
npm run dev

# Clear browser cache or use Incognito mode
# Try connecting again
```

---

## 🔍 Step-by-Step Test

1. **Update `.env`**:
   ```env
   VITE_GOOGLE_CLIENT_ID=************-****************************************.apps.googleusercontent.com
   # Remove or comment out the API_KEY line
   ```

2. **Save and restart dev server**:
   ```bash
   npm run dev
   ```

3. **Open browser** to `http://localhost:5173`

4. **Click "Connect Google Calendar"**

5. **You should see**:
   - Google sign-in popup
   - "Choose an account" screen
   - Permission request for calendar access
   
6. **If you see the 400 error again**:
   - Open browser DevTools (F12)
   - Go to Console tab
   - Copy any error messages
   - Check the "Network" tab for failed requests

---

## 🆘 Still Not Working?

### Check Browser Console (F12)
Look for errors like:
- `redirect_uri_mismatch` → Fix redirect URIs in Google Console
- `invalid_client` → Client ID is wrong in `.env`
- `access_denied` → User not added as test user

### Verify Your Client ID Format
Should look like: `************-****************.apps.googleusercontent.com`

### Try Incognito Mode
Sometimes cached OAuth credentials cause issues.

### Double-Check URLs
- Accessing via `http://localhost:5173` (not `https`, not different port)
- No trailing slashes in Google Console URIs
- Exact matches between browser URL and authorized origins

---

## 📞 Need More Help?

Check these files for detailed setup:
- `CALENDAR_SETUP.md` - Full setup guide
- `CALENDAR_INTEGRATION.md` - Technical details

Or check the browser console for specific error messages to troubleshoot further.
