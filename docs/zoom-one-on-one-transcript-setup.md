# Zoom setup for HR 1:1 links and transcripts

SavvyOS now creates a dedicated Zoom meeting for every scheduled HR 1:1, puts the participant link on the leader's connected Google Calendar event, and imports the completed Zoom cloud transcript into the protected 1:1 record.

## Required Zoom configuration

Create or update the internal **Server-to-Server OAuth** app used by SavvyOS. The Railway service needs these existing variables:

- `ZOOM_ACCOUNT_ID`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`
- `ZOOM_WEBHOOK_SECRET_TOKEN`

`ZOOM_WEBINAR_HOST_ID` remains required for the webinar feature. HR 1:1 meetings do not use it. SavvyOS creates a 1:1 under the selected leader's Zoom email, so each leader who hosts 1:1s must be a licensed user in the same Zoom account and have the same email address in Zoom and SavvyOS.

Grant the app the account-level permissions necessary to create meetings and read cloud recordings. In Zoom's current scope picker, this is normally `meeting:write:admin` and `recording:read:admin`. Keep the app limited to the required scopes.

## Cloud recording and transcript policy

At the Zoom account or group level, enable and lock these recording settings for 1:1 hosts:

1. **Cloud recording**
2. **Audio transcript** or **Create audio transcript**
3. Automatic cloud recording, when Zoom permits it for the account

SavvyOS sends `auto_recording: cloud` when it creates an HR 1:1. Zoom still requires the account, host license, and recording policy to allow cloud recording and audio transcripts. Do not use this workflow for a meeting that should not be recorded. Leaders should inform participants according to Savvy STR Agents policy and applicable law.

## Webhook subscription

In the Zoom Marketplace app, add an event subscription with this notification endpoint:

```text
https://os.savvy-agents.com/api/webhooks/zoom
```

Subscribe to **`recording.transcript_completed`**. Keeping the existing webinar events is safe. Use Zoom's event-subscription secret token as `ZOOM_WEBHOOK_SECRET_TOKEN` in Railway.

When Zoom says a transcript is ready, SavvyOS verifies the signed event, uses the short-lived download token supplied by Zoom, imports the VTT text, and discards the token. It does not store Zoom recording media or the download URL. Duplicate webhooks for the same transcript file are ignored. A manually saved transcript is never overwritten automatically.

## Repairing an existing 1:1

For a 1:1 created before this release, open its HR 1:1 workspace and select **Sync Zoom and Calendar**. SavvyOS creates the missing Zoom meeting, then updates the existing Google Calendar event with the join link. If the leader does not have a connected Google Calendar, connect it in **My Profile** first and run the sync again.

## Operational checks

1. Schedule a test 1:1 with a licensed Zoom leader.
2. Confirm the 1:1 workspace shows **Join Zoom** and the Google Calendar event contains the same participant link.
3. Run the meeting and let Zoom finish its cloud transcript. Zoom may deliver this after the meeting ends.
4. Confirm the 1:1 workspace shows **Transcript: Imported** and the full transcript is available for HR review.

**References**

- [Zoom Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)
- [Zoom recording webhooks and download tokens](https://developers.zoom.us/blog/meeting-api-querying-tips-part4/)
