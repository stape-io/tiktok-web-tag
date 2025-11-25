# TikTok Pixel for Google Tag Manager Web

The **TikTok Pixel by Stape** tag integrates the TikTok Pixel into your website via a Google Tag Manager Web container. It allows you to send standard or custom events to TikTok, including user data for Advanced Matching, to improve ad performance and attribution.

✅ Unlike other TikTok Pixel tag templates, this tag **does not** require the Base Code installed as a Custom HTML tag to work.

## How to Use

1.  Add the **TikTok Pixel by Stape** tag to your Web GTM container.
2.  Enter one or more **TikTok Pixel IDs** (array, single item string or comma separate string of Pixel IDs).
3.  Choose how the **Event Name** is defined:
    -   **Inherit from DataLayer** — maps GTM/GA4 event names to TikTok equivalents.
    -   **Override** — choose from a list of standard events or provide a custom event name.
4.  Enable **Automatic Data Layer Mapping** (recommended) to automatically parse GA4, UA, and Common Event Data formats for event and user data.
5.  (Optional) Enable **Advanced Matching** to securely pass user data (e.g., email, phone) to TikTok for better match rates.
6.  (Optional) Enable **Event User Data Enhancement** to store and reuse user data via `localStorage` across sessions.
7.  (Optional) Configure **Compliance Settings**, including TikTok's consent modes, Google Consent Mode, or Limited Data Use (LDU).
8.  (Optional) Configure **Server-Side Tracking Settings** by providing an Event ID for deduplication with the TikTok Events API.
9.  (Optional) Add extra metadata to your events using the **Event Parameters** and **Additional Event Parameters** sections.
10. (Optional) Adjust **Additional Settings** to disable automatic history event tracking for Single Page Applications (SPAs).

## Event Name Setup Options

-   **Standard Events** (when overriding):
    -   `Pageview`, `AddToCart`, `Purchase`, `Lead`, `ViewContent`, `CompleteRegistration`, etc.
-   **Inherit from DataLayer** (default):
    -   Maps GA4 events like `purchase`, `add_to_cart`, `sign_up`, etc., to their TikTok equivalents.

## Required Fields

-   **TikTok Pixel ID(s)** — Must be an array, a single Pixel ID or a comma-separated list of IDs.
-   **Event Name** — Must be resolved either from the Data Layer or the override settings.

## Features

### Advanced Matching

Securely enrich events with user identifiers to improve ad performance. The tag can automatically hash PII using SHA256 if it's not already hashed. Supported fields include:

-   **Email** (`email`)
-   **Phone Number** (`phone_number`)
-   **External ID** (`external_id`)

User data can be sourced from:

-   A manually entered table.
-   The Data Layer (`user_data` object).
-   A custom variable (e.g., a User-Provided Data Variable).

### Event User Data Enhancement

When enabled, user data is stored in `localStorage` to persist across events and sessions. This improves match quality for repeat visitors or multi-page actions. Data can be stored in plain text or hashed.

### Compliance Settings

The tag provides robust support for privacy and compliance requirements:

-   **TikTok Consent Mode**: Configure the pixel to operate in an "opt-in" (waits for consent) or "opt-out" (fires until consent is revoked) mode.
-   **Manual Consent**: Explicitly grant or deny consent for the pixel to fire.
-   **GTM Consent Mode**: The tag respects GTM's native consent signals, specifically checking for `ad_storage` consent.
-   **Limited Data Use (LDU)**: Enable LDU for users in U.S. states with specific data privacy laws.

### Server-Side Deduplication

If you use both client-side and server-side (Events API) TikTok tracking, you can prevent duplicate conversions:

-   Use the **Event ID** field to send a unique identifier for each event.
-   Enable **DataLayer Push** to create a new Data Layer event containing the Event ID, which can be used to trigger your server-side tag and ensure synchronization.

### Event and Additional Parameters

Send extra metadata with your events using:

-   **Event Parameters Table**: For standard TikTok parameters.
-   **Additional Event Parameters Table**: For custom parameters or those specific to verticals like Travel and Automotive.
-   **Data Layer Mapping**: Automatically maps standard e-commerce parameters from GA4/UA objects.
-   **Custom Variable**: Load parameters from a JavaScript object variable.

Supported parameters include:

-   `value`, `currency`, `contents`, `content_ids`, `num_items`, and more.

### Other Settings

-   **Disable History Event Tracking**: The TikTok Pixel automatically tracks browser history changes (e.g., in SPAs) as `Pageview` events. This option allows you to disable this behavior to prevent duplicate pageviews and have more control over tracking, especially when using the Events API for deduplication.

### Debugging

You can verify and troubleshoot your pixel implementation using three primary methods:
-   **Debug Mode**: Check the Pixel debug messages on the browser console (DevTools). [Learn more](https://business-api.tiktok.com/portal/docs?id=1739585706138625).
-   **Test Events**: A feature within TikTok Events Manager that allows you to debug pixel events in real-time to ensure they are being received and processed correctly. [Learn more](https://ads.tiktok.com/help/article/test-tiktok-pixel-events-video-walkthrough?aadvid=7430849034966794248&lang=en).
-   **TikTok Pixel Helper**: A Chrome extension that provides real-time feedback on your pixel events and helps identify errors. [Learn more](https://ads.tiktok.com/help/article/tiktok-pixel-helper-2.0?aadvid=7430849034966794248&lang=en).

## Open Source
The **TikTok Pixel for Google Tag Manager Web** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
