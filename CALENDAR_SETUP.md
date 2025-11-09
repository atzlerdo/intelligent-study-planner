# Google Calendar Integration Setup Guide

## Prerequisites
1. Google Cloud Console account
2. Project already has `@react-oauth/google` and `gapi-script` installed

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name: "Intelligent Study Planner" (or your choice)
4. Click "Create"

## Step 2: Enable Google Calendar API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

## Step 3: Configure OAuth Consent Screen (CRITICAL)

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" (or "Internal" if you have a Google Workspace)
3. Click "Create"
4. Fill in required fields:
   - **App name**: Intelligent Study Planner
   - **User support email**: Your email
   - **Developer contact**: Your email
5. Click "Save and Continue"
6. **Scopes**: Click "Add or Remove Scopes"
   - Search for "calendar"
   - Select: `https://www.googleapis.com/auth/calendar` (See, edit, share, and permanently delete all calendars)
   - Click "Update" then "Save and Continue"
7. **Test users**: Click "Add Users"
   - Add your Google email address
   - Click "Save and Continue"
8. Review and click "Back to Dashboard"

## Step 4: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Configure OAuth Client ID:
   - **Application type**: Web application
   - **Name**: Study Planner Web Client
   
4. **CRITICAL - Authorized JavaScript origins**:
   Add EXACTLY these URLs (no trailing slashes):
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   
5. **CRITICAL - Authorized redirect URIs**:
   Add EXACTLY these URLs (no trailing slashes):
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   
6. Click "Create"
7. **Copy the Client ID** from the popup (starts with numbers and ends with `.apps.googleusercontent.com`)
8. **Important**: You do NOT need the Client Secret for this app!

## Step 5: Configure Your Project

1. Open `.env` file in your project root
2. Replace the placeholder with your **Client ID ONLY**:
   ```env
   VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnop.apps.googleusercontent.com
   ```

3. **Important Notes**:
   - ✅ Use the **Client ID** (long string ending in `.apps.googleusercontent.com`)
   - ❌ Do NOT use the Client Secret (starts with `GOCSPX-`)
   - ❌ API Key is not needed for OAuth flow
   - Never commit `.env` to version control!

## Step 6: Restart Dev Server

After updating `.env`, restart your development server:
```bash
# Stop the current server (Ctrl+C)
npm run dev
```

## Step 7: Test the Integration

1. Open browser to `http://localhost:5173`
2. Go to the Dashboard
3. Find the "Google Calendar Sync" card (left sidebar on desktop)
4. Click "Connect Google Calendar"
5. A Google sign-in popup should appear
6. Select your Google account (must be a test user)
7. Review permissions and click "Continue"
8. Once connected, click "Sync Now"
9. Check your Google Calendar for the new "Intelligent Study Planner" calendar!

## Features Implemented

### Two-Way Synchronization
- **App → Calendar**: All study sessions are pushed to a dedicated Google Calendar
- **Calendar → App**: Changes made in Google Calendar are imported back

### Dedicated Calendar
- Creates a separate calendar called "Intelligent Study Planner"
- All sessions are stored in this calendar
- Easy to show/hide in your main calendar view

### Session Details Synced
- Course name in event title (with 📚 emoji)
- Course details in description (type, ECTS, semester)
- Start and end times (including multi-day sessions)
- Session notes

### Smart Sync
- Updates existing events instead of creating duplicates
- Deletes events that were removed from the app
- Merges imported events without duplication

## Troubleshooting

### "400 Bad Request" / "The server cannot process the request"
**Most common issue!** This means OAuth configuration is incorrect:

1. ✅ **Check your `.env` file**:
   - Use Client ID (ends with `.apps.googleusercontent.com`)
   - Do NOT use Client Secret (starts with `GOCSPX-`)
   
2. ✅ **Verify Authorized JavaScript origins** in Google Cloud Console:
   - Must include: `http://localhost:5173` (no trailing slash)
   - Must include: `http://127.0.0.1:5173` (no trailing slash)
   
3. ✅ **Verify Authorized redirect URIs**:
   - Must include: `http://localhost:5173`
   - Must include: `http://127.0.0.1:5173`
   
4. ✅ **Restart dev server** after any `.env` changes:
   ```bash
   npm run dev
   ```

5. ✅ **Clear browser cache** or use incognito mode

### "Access blocked: This app's request is invalid"
- Your email must be added as a Test User in OAuth consent screen
- Make sure OAuth consent screen is saved and published (at least in Testing mode)
- The Google Calendar API must be enabled

### "Failed to connect to Google Calendar"
- Client ID is incorrect or missing from `.env`
- Check browser console for detailed error messages
- Verify you're accessing via `http://localhost:5173` (not `https` or different port)

### "Sync failed: 403 Forbidden"
- Google Calendar API not enabled in Cloud Console
- Scope `https://www.googleapis.com/auth/calendar` not added to OAuth consent screen
- Your email not added as Test User

### Events not appearing in calendar
- Wait 5-10 seconds and refresh Google Calendar
- Check that "Intelligent Study Planner" calendar is visible (left sidebar in Google Calendar)
- Click the calendar name to make sure it's checked/visible
- Check browser console (F12) for error messages

### "redirect_uri_mismatch" error
- The redirect URI in your Google Cloud Console doesn't match `http://localhost:5173`
- Add both `http://localhost:5173` AND `http://127.0.0.1:5173` to be safe
- Restart dev server after fixing

## Security Notes

1. **Never commit `.env` file** - it's already in `.gitignore`
2. The `.env.example` file is safe to commit (contains no real credentials)
3. OAuth tokens are stored in browser memory only, not in localStorage
4. Consider adding your production domain to OAuth settings before deployment

## Production Deployment

Before deploying to production:

1. Add your production domain to OAuth authorized origins:
   - Go to Google Cloud Console → Credentials
   - Edit your OAuth Client ID
   - Add production URL to both:
     - Authorized JavaScript origins
     - Authorized redirect URIs

2. Update OAuth consent screen to "Published" status if needed

3. Set environment variables in your hosting platform (Vercel, Netlify, etc.)

## Additional Resources

- [Google Calendar API Documentation](https://developers.google.com/calendar/api/v3/reference)
- [OAuth 2.0 for Client-side Web Applications](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)
