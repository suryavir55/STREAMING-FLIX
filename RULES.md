# ZK Movie - Project Rules & Firebase Database Rules

## Project Overview
ZK Movie হলো একটি স্ট্রিমিং ওয়েবসাইট যেখানে মুভি ও ওয়েব সিরিজ দেখা যায়। Firebase Realtime Database ব্যবহার করা হয় ডেটা স্টোর করতে।

## Firebase Database Structure

### `/users/{userId}`
- User profile data (name, email, online status)
- `premium/` - Premium subscription data
  - `active: boolean`
  - `expiresAt: number (timestamp)`
  - `redeemedAt: number`
  - `code: string`

### `/webseries/{id}`
- Web series content with seasons & episodes
- Fields: title, poster, backdrop, year, rating, language, category, storyline, cast, seasons, trailer, createdAt

### `/movies/{id}`
- Movie content with streaming links
- Fields: title, poster, backdrop, year, rating, language, category, storyline, cast, movieLink, movieLink480/720/1080/4k, trailer, createdAt

### `/categories/{id}`
- Content categories (name, createdAt)

### `/notifications/{userId}/{notifId}`
- Per-user notifications (title, message, type, timestamp, read)

### `/newEpisodeReleases/{id}`
- New episode/movie release announcements

### `/redeemCodes/{id}`
- Premium redeem codes (code, days, used, usedBy, createdAt)

### `/fcmTokens/{userId}/{tokenKey}`
- Push notification tokens per user per device

### `/freeAccessUsers/{id}`
- Users with active free access via Arolink/ad gate

### `/globalFreeAccess`
- Global free access for all users (active, expiresAt, activatedAt)

### `/maintenance`
- Server maintenance status (active, message, resumeDate, startedAt)

### `/adsConfig/{id}`
- Ad SDK configurations (type, sdkCode, placement, enabled, note)

### `/settings/`
- `tutorialLink` - Tutorial video URL
- `mainSdk` - Main verification SDK script
- `arolink/` - Arolink config (apiKey, accessHours)
- `uiConfig/` - UI text/logo customization
- `fcmConfig/` - FCM push notification config (vapidKey, sendEndpoint)

### `/admin/pin`
- Admin panel PIN security (enabled, code)

### `/appUsers/{key}`
- App-level user credentials for login

### `/comments/{contentId}/{commentId}`
- User comments with replies

### `/analytics/`
- `views/{contentId}/{date}/{userId}` - View tracking
- `activeViewers/{contentId}/{userId}` - Currently watching
- `dailyActive/{date}/{userId}` - Daily active users

## Firebase Realtime Database Rules

```json
{
  "rules": {
    ".read": true,
    ".write": true,
    "users": {
      "$uid": {
        ".read": true,
        ".write": true
      }
    },
    "webseries": {
      ".read": true,
      ".write": true
    },
    "movies": {
      ".read": true,
      ".write": true
    },
    "categories": {
      ".read": true,
      ".write": true
    },
    "notifications": {
      "$uid": {
        ".read": true,
        ".write": true
      }
    },
    "redeemCodes": {
      ".read": true,
      ".write": true
    },
    "fcmTokens": {
      ".read": true,
      ".write": true
    },
    "freeAccessUsers": {
      ".read": true,
      ".write": true
    },
    "globalFreeAccess": {
      ".read": true,
      ".write": true
    },
    "maintenance": {
      ".read": true,
      ".write": true
    },
    "adsConfig": {
      ".read": true,
      ".write": true
    },
    "settings": {
      ".read": true,
      ".write": true
    },
    "admin": {
      ".read": true,
      ".write": true
    },
    "appUsers": {
      ".read": true,
      ".write": true
    },
    "comments": {
      ".read": true,
      ".write": true
    },
    "analytics": {
      ".read": true,
      ".write": true
    },
    "newEpisodeReleases": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Redeem Code Format
- Prefix: `ZK-`
- Example: `ZK-A1B2C3-D4E5`

## Admin Access
- Admin email: `najimhussei993@gmail.com`
- Admin panel route: `/admin`
- Optional PIN security for extra protection

## Premium System
- Users redeem codes to get premium
- Premium data stored at `users/{userId}/premium`
- Premium users get ad-free experience
- Premium badge (crown) shown on profile

## Ad System
- Main SDK for site verification (must be added first)
- Individual ad SDKs (banner, popup, native, push notification, etc.)
- Arolink with configurable access hours
- Free access via ad gate (configurable hours from admin)

## Branding
- App name: ZK Movie
- Admin panel: ZK Admin / ZK Control Panel
- Admin reply name: Admin (ZK)
- Backup filename: zk-movie-backup
