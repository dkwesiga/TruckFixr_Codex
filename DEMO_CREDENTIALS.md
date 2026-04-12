# TruckFixr Demo Credentials & Testing Guide

## Demo Account

Use these credentials to test TruckFixr with full owner privileges:

```
Email:    demo@truckfixr.com
Password: Demo123!
Role:     Owner (full privileges)
```

## How to Access

1. **Via Sign Up Page:**
   - Click "Sign Up" button on landing page or navigate to `/signup`
   - Select "Email" tab
   - Enter the demo credentials above
   - Click "Create Account"

2. **Via Email Auth:**
   - Navigate to `/auth/email`
   - Use the demo credentials

3. **Via OAuth (Alternative):**
   - Use your Manus account to sign in
   - You'll be assigned a user role based on your account

## Demo Account Privileges

As an **owner**, you have full access to:

- ✅ Fleet management (create, edit, delete fleets)
- ✅ Vehicle/truck management (add, update, remove trucks)
- ✅ Team management (invite managers and drivers)
- ✅ Inspection templates (create and customize)
- ✅ Defect management (view, triage, resolve)
- ✅ TADIS diagnostics (full access including premium features)
- ✅ Analytics and reporting
- ✅ Billing and subscription management
- ✅ Settings and configuration

## Recommended Test Flows

### Flow 1: Complete Fleet Setup (10 minutes)

1. **Sign in** with demo credentials
2. **Create a fleet:**
   - Click "Create Fleet" or go to fleet management
   - Name: "Demo Fleet"
   - Leave other fields as defaults
3. **Add vehicles:**
   - Add 3 trucks with these details:
     - Truck 1: VIN=1HGBH41JXMN109186, License=DEMO-001, Make=Volvo, Year=2022
     - Truck 2: VIN=2HGBH41JXMN109187, License=DEMO-002, Make=Freightliner, Year=2021
     - Truck 3: VIN=3HGBH41JXMN109188, License=DEMO-003, Make=Peterbilt, Year=2020
4. **Verify** all trucks appear in the fleet dashboard

### Flow 2: Driver Inspection Workflow (15 minutes)

1. **Switch to driver role** (if available, or use driver account)
2. **Start inspection:**
   - Select a truck from the list
   - Begin daily inspection
3. **Complete inspection items:**
   - Check off various inspection items
   - Add notes to 2-3 items
4. **Report defects:**
   - Add 3 defects with different severity levels:
     - Low: "Windshield wiper blade worn"
     - Medium: "Brake pad thickness at 40%"
     - High: "Engine oil pressure fluctuating"
5. **Submit inspection:**
   - Review summary
   - Click submit
   - Verify confirmation screen

### Flow 3: Manager Triage & Actions (10 minutes)

1. **Return to manager dashboard**
2. **View defects:**
   - Check "Open Defects by Severity" widget
   - Verify all 3 defects appear
3. **Review TADIS analysis:**
   - Click on each defect
   - Review AI-powered diagnostics
   - Check recommended actions
4. **Take actions:**
   - Acknowledge a defect
   - Assign a defect to a driver
   - Resolve a defect
5. **Check action log:**
   - Verify all actions are recorded

### Flow 4: Analytics Tracking (5 minutes)

1. **Open browser DevTools** (F12)
2. **Go to Network tab**
3. **Perform actions:**
   - Create a fleet
   - Add a vehicle
   - Submit an inspection
   - Report a defect
4. **Check PostHog events:**
   - Look for requests to PostHog API
   - Verify event names match expected events
   - Check event properties

## Test Data Scenarios

### Scenario A: Healthy Fleet
- All trucks with recent inspections
- No critical defects
- Good maintenance history
- Expected: Green dashboard, minimal alerts

### Scenario B: Problem Fleet
- Multiple trucks with overdue inspections
- Critical defects pending action
- High defect count
- Expected: Red dashboard, urgent alerts

### Scenario C: Mixed Fleet
- Some trucks healthy, some with issues
- Various defect severity levels
- Partial inspection history
- Expected: Yellow dashboard, balanced alerts

## Common Testing Tasks

### Test Email Signup
1. Go to `/signup`
2. Click "Create Account" tab
3. Fill in form with demo credentials
4. Verify account creation succeeds
5. Verify user is logged in

### Test Email Login
1. Go to `/signup`
2. Click "Sign In" tab
3. Enter demo credentials
4. Verify login succeeds
5. Verify user is redirected to dashboard

### Test Inspection Flow
1. Go to `/inspection`
2. Select a truck
3. Complete inspection items
4. Report defects
5. Submit and verify confirmation

### Test Defect Creation
1. Go to manager dashboard
2. Click "Create Defect" or similar
3. Fill in defect details
4. Verify TADIS analysis runs
5. Verify defect appears in list

### Test Analytics
1. Open browser console
2. Perform user actions
3. Check for console logs with `[Analytics]` prefix
4. Verify PostHog events are captured

## Troubleshooting

### Account Not Created
- Check if email already exists
- Verify password meets requirements (min 8 chars)
- Check browser console for errors

### Can't Sign In
- Verify email and password are correct
- Clear browser cookies and try again
- Check if account was successfully created

### Defects Not Appearing
- Refresh the page
- Check browser console for errors
- Verify inspection was submitted successfully

### Analytics Not Tracking
- Check if PostHog API key is configured
- Open browser DevTools Network tab
- Look for requests to PostHog API
- Check browser console for initialization messages

## Reset Demo Account

If you need to reset the demo account:

1. **Delete current account:**
   - Go to settings
   - Click "Delete Account"
   - Confirm deletion

2. **Create new account:**
   - Go to `/signup`
   - Use same demo credentials
   - This creates a fresh account

3. **Seed test data:**
   - Run: `node scripts/seed-demo-account.mjs`
   - This creates sample fleet and vehicle data

## Security Notes

⚠️ **Important:** This demo account is for testing only.

- Do NOT use in production
- Do NOT share credentials publicly
- Do NOT store sensitive data in demo account
- Credentials are hardcoded for testing convenience only
- Change password before deploying to production

## Next Steps

After testing with the demo account:

1. **Create real accounts** for team members
2. **Set up your fleet** with actual truck data
3. **Invite drivers** to complete inspections
4. **Configure inspection templates** for your fleet
5. **Set up billing** if using paid plan

## Support

For issues or questions:

1. Check browser console for error messages
2. Review this documentation
3. Check ANALYTICS.md for tracking details
4. Contact support@truckfixr.com

---

**Last Updated:** April 2026
**Version:** 1.0
