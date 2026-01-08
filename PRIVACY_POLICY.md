# Instafn Privacy Policy

**Last Updated:** Jan 8, 2026

## Introduction

Instafn ("we", "our", or "us") is a browser extension that enhances the Instagram web experience with privacy controls and useful features. This Privacy Policy explains how we collect, use, and protect your information when you use our extension.

## Information We Collect

### User Preferences

We store your extension settings and preferences locally in your browser using Chrome's storage API. This includes:

- Feature toggles (which features are enabled/disabled)
- UI customization preferences
- Confirmation dialog settings

### Message Logger Data (Optional Feature)

If you enable the message logger feature, the extension:

- Logs deleted direct messages locally in your browser
- Stores message metadata (sender, timestamp, content)
- Automatically deletes messages older than 24 hours
- Stores a maximum of 5,000 messages locally

**This data is stored only on your device and is never transmitted to us or any third party.**

### Profile Comments Data (Optional Feature)

If you enable the profile comments feature, comments you post are stored on Supabase (a third-party database service) to enable the feature's functionality. This includes:

- Comment text
- Your Instagram username and user ID
- Profile information for the profile where comments are posted
- Timestamps

**This data is stored on Supabase servers and is necessary for the profile comments feature to function.**

### User Activity Monitoring

The extension monitors certain user actions on Instagram (likes, comments, follows, calls, etc.) to provide confirmation dialogs and analyze follower relationships. This monitoring:

- Occurs only on Instagram.com
- Is processed locally in your browser
- Is not transmitted to external servers (except for profile comments feature)

### Authentication Information

The extension uses your Instagram session cookies and authentication tokens to:

- Authenticate API requests to Instagram's servers
- Enable features that require Instagram API access (profile comments, follow analyzer)

**These credentials are used only to communicate with Instagram's servers and are never stored or transmitted to us.**

## How We Use Your Information

- **Local Features:** Most features process data entirely on your device
- **Profile Comments:** Comments are stored on Supabase to enable the profile comments feature
- **Settings:** Your preferences are stored locally to remember your choices

## Data Sharing

We do not sell, rent, or share your personal information with third parties except:

- **Supabase:** Profile comments data is stored on Supabase servers as necessary for the feature to function
- **Instagram:** The extension makes API requests to Instagram using your authenticated session

## Data Storage

- **Local Storage:** Most data is stored locally in your browser using Chrome's storage API
- **Supabase:** Profile comments are stored on Supabase servers
- **Automatic Deletion:** Message logger data automatically expires after 24 hours

## Your Rights

You can:

- Enable or disable any feature at any time through the extension settings
- Clear all stored data by uninstalling the extension
- Access your locally stored data through Chrome's developer tools

## Security

We implement reasonable security measures to protect your information. However, no method of transmission over the internet is 100% secure.

## Children's Privacy

Our extension is not intended for users under the age of 13. We do not knowingly collect information from children under 13.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last Updated" date.

## Contact Us

If you have questions about this Privacy Policy, please contact us at [your email or contact method].

## Third-Party Services

- **Supabase:** We use Supabase to store profile comments data. Their privacy policy: https://supabase.com/privacy
- **Instagram:** This extension interacts with Instagram's services. Instagram's privacy policy: https://help.instagram.com/519522125107875

---

**Note:** This extension is not affiliated with, endorsed by, or associated with Instagram or Meta.
