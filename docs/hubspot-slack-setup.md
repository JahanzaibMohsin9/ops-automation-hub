# HubSpot and Slack Setup

This guide documents the HubSpot and Slack integrations. It matches the behavior in Settings and the Trigger.dev tasks already in the repository.

## HubSpot

The app uses a single server-side HubSpot private app token and stores workspace-level connection state in the database.

### Required environment variable

- `HUBSPOT_PRIVATE_APP_TOKEN`

### Recommended private app scopes

- `crm.objects.contacts.read`
- `crm.objects.contacts.write`

### Setup steps

1. In HubSpot, create a private app for this project.
2. Grant contact read and write access.
3. Copy the generated token into `.env.local` as `HUBSPOT_PRIVATE_APP_TOKEN`.
4. Restart the Next.js app after changing env vars.
5. Open the app and go to Settings.
6. In the HubSpot card, confirm the status changes from `Env token missing` to `Ready to connect`.
7. Click `Connect HubSpot` for the active workspace.

### What the app does with HubSpot

- Reads account metadata from `/integrations/v1/me`
- Searches contacts by email
- Updates an existing contact if one already exists
- Creates a contact when no match is found
- Stores sync metadata per workspace and lead

### Current field mapping

- `email` <- lead email
- `firstname` <- first name derived from `fullName`
- `lastname` <- last name derived from `fullName`
- `company` <- lead company name
- `phone` <- lead phone when present
- `website` <- normalized `companyDomain` when present
- `jobtitle` <- lead job title when present

### Verification flow

1. Import or create a lead.
2. Start the Trigger.dev worker with `npm run trigger:dev`.
3. Ensure the lead scores as `qualified`.
4. Confirm a `CRMContactSync` record is written and the lead remains `qualified`.
5. Check HubSpot for the matching contact record.

### Failure behavior

- If the token is missing, the workspace cannot connect.
- If the workspace is disconnected, qualified leads skip HubSpot sync and an audit log is written.
- If sync retries are exhausted, the lead becomes `sync_failed` and a Slack alert can be emitted.

## Slack

The app uses Slack incoming webhooks. A workspace can either store its own webhook URL or rely on the shared `SLACK_WEBHOOK_URL` environment variable.

### Required environment variable

- `SLACK_WEBHOOK_URL` if you want a shared fallback for all workspaces

### Setup steps

1. In Slack, create an incoming webhook for the target channel.
2. Copy the webhook URL.
3. Set `SLACK_WEBHOOK_URL` in `.env.local` if you want a shared fallback for all workspaces.
4. Or leave the env var blank and paste the webhook URL into the Slack settings form for a single workspace.
5. In the app Settings page, optionally add a human-friendly channel label like `#revenue-ops-alerts`.
6. Leave the relevant notification toggles enabled.
7. Save the Slack settings.

### Notification types currently supported

- `qualified_lead`
- `review_needed`
- `crm_sync_failure`
- `document_processing_failure`

### Verification flow

1. Save Slack settings for the workspace.
2. Process a lead through the Trigger.dev worker.
3. Confirm alerts post for one of the enabled notification types.
4. Toggle a notification off and confirm later runs skip that alert without failing the main job.

### Failure behavior

- If no webhook is configured, Slack delivery is skipped instead of crashing the lead pipeline.
- If a notification type is disabled, the task records a skipped audit event.
- If Slack returns a non-2xx response, the notification task retries and records the failure in the audit log.
