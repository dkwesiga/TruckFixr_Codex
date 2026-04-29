# Email Signup Error Handling Guide

## Error Messages & Solutions

### Signup Errors

#### 1. "This email is already registered. Please sign in or use a different email."
**Cause:** The email address is already associated with an account in the database.

**Solutions:**
- Use the **Sign In** button to log in with your existing account
- Use a different email address to create a new account
- If you forgot your password, use the password reset feature (coming soon)

---

#### 2. "Password must be at least 8 characters"
**Cause:** The password is shorter than the minimum required length.

**Solutions:**
- Create a password with at least 8 characters
- Example: `MyPassword123`

---

#### 3. "Password must contain at least one uppercase letter"
**Cause:** The password doesn't include any capital letters (A-Z).

**Solutions:**
- Add at least one uppercase letter to your password
- Example: `MyPassword123` (starts with capital M)

---

#### 4. "Password must contain at least one number"
**Cause:** The password doesn't include any digits (0-9).

**Solutions:**
- Add at least one number to your password
- Example: `MyPassword123` (ends with 123)

---

#### 5. "Please enter a valid email address"
**Cause:** The email format is invalid.

**Solutions:**
- Use a standard email format: `name@domain.com`
- Examples of valid emails:
  - john.doe@company.com
  - user+tag@example.co.uk
  - firstname.lastname@domain.com

---

#### 6. "Name must be at least 2 characters"
**Cause:** The name field is too short.

**Solutions:**
- Enter at least 2 characters for your name
- Examples: `Jo`, `John Doe`, `Jane Smith`

---

### Signin Errors

#### 1. "No account found with this email. Please sign up first."
**Cause:** No user account exists with the provided email address.

**Solutions:**
- Check that you entered the correct email address
- Use the **Sign Up** button to create a new account
- Verify the email hasn't been typed with extra spaces

---

#### 2. "Incorrect password. Please try again."
**Cause:** The password doesn't match the one associated with this email.

**Solutions:**
- Double-check your password (case-sensitive)
- Ensure Caps Lock is off
- Try again carefully, character by character
- Use password reset feature if you forgot your password (coming soon)

---

## Password Requirements Summary

Your password must meet ALL of these criteria:
- ✓ At least 8 characters long
- ✓ Contains at least one uppercase letter (A-Z)
- ✓ Contains at least one number (0-9)

**Valid Examples:**
- `Password123`
- `MyFleet2024`
- `TruckFixr99`
- `SecurePass456`

**Invalid Examples:**
- `password123` (no uppercase)
- `Password` (no number)
- `Pass1` (too short)
- `PASS1234` (no lowercase - though technically valid, not recommended)

---

## Demo Account

For testing purposes, use:
- **Email:** demo@truckfixr.com
- **Password:** Demo123!

This account has full owner privileges and includes sample fleet data.

---

## Need Help?

If you encounter other issues:
1. Check your browser console for detailed error messages
2. Try clearing your browser cache and cookies
3. Contact support@truckfixr.com for assistance
4. Call us at 905-677-7663
