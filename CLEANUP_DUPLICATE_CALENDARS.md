# How to Clean Up Duplicate Calendars

If you connected your Google Calendar **before** the duplicate calendar fix (November 22, 2024), you may have 3 or more calendars named "Intelligent Study Planner" in your Google Calendar.

## Quick Fix

### Option 1: Manual Cleanup (5 minutes)

**Keep your existing sessions:**

1. Open **Google Calendar** (https://calendar.google.com)
2. Click the **settings gear icon** (top right)
3. Select **"Settings"**
4. In the left sidebar, scroll to **"Settings for my calendars"**
5. Find all calendars named **"Intelligent Study Planner"**
6. **Keep ONE calendar** (any of them is fine - they all have the same sessions)
7. **Delete the duplicates:**
   - Click on a duplicate calendar
   - Scroll down and click **"Remove calendar"**
   - Click **"Delete permanently"**
   - Repeat for each duplicate
8. Return to the Intelligent Study Planner app
9. Click **"Disconnect"** (if connected)
10. Click **"Connect to Google Calendar"** again
11. When prompted, select the calendar you kept

✅ **Done!** You now have exactly 1 calendar with all your sessions.

### Option 2: Fresh Start (2 minutes)

**Start completely fresh:**

1. In the Intelligent Study Planner app, click **"Disconnect"**
2. Open **Google Calendar** (https://calendar.google.com)
3. **Delete ALL** calendars named "Intelligent Study Planner":
   - Settings → Settings for my calendars
   - For each "Intelligent Study Planner" calendar:
     - Click calendar → "Remove calendar" → "Delete permanently"
4. Return to the Intelligent Study Planner app
5. Click **"Connect to Google Calendar"**

✅ **Done!** The app will create ONE new calendar with the fix applied.

⚠️ **Warning:** This deletes all Google Calendar sessions. Your app sessions are safe.

## How to Tell If You Have Duplicates

### In Google Calendar:

1. Open Google Calendar
2. Look at the left sidebar under "My calendars"
3. If you see **multiple entries** named "Intelligent Study Planner", you have duplicates

### In the App:

1. Disconnect from Google Calendar
2. Connect again
3. If you see a dialog saying **"Found 3 (or more) existing calendar(s)"**, you have duplicates

## Why Did This Happen?

**React StrictMode** (development mode feature) intentionally renders components twice to detect bugs. Before the fix, this caused the app to create multiple calendars during a single connection.

**The fix:** Added a promise cache so all concurrent calls wait for the same calendar creation operation. Now only ONE calendar is created, even with React StrictMode.

## Verification

After cleanup:

✅ Check Google Calendar: **Exactly 1** calendar named "Intelligent Study Planner"  
✅ Disconnect → Reconnect in app: **No dialog** asking to merge  
✅ Check browser console: See `🔒 Calendar creation already in progress...` for concurrent calls  
✅ All your sessions still visible in both app and Google Calendar  

## Need Help?

If you're still seeing duplicates after following these steps:

1. Check browser console for errors
2. Try clearing browser cache: `localStorage.clear()`
3. Verify you're using the latest version with the fix
4. Check the main documentation: `CALENDAR_DUPLICATE_FIX_20251122.md`
