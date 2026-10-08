import type { SlackNotificationType } from "./connection";

export type SlackField = {
  label: string;
  value: string;
};

export type SlackNotificationTemplateInput = {
  type: SlackNotificationType;
  title: string;
  fields: SlackField[];
  linkUrl?: string | null;
  linkLabel?: string | null;
  channelName?: string | null;
  body?: string | null;
};

function getEmoji(type: SlackNotificationType) {
  switch (type) {
    case "qualified_lead":
      return ":white_check_mark:";
    case "review_needed":
      return ":warning:";
    case "crm_sync_failure":
      return ":x:";
    case "document_processing_failure":
      return ":page_facing_up:";
  }
}

function getContextLabel(type: SlackNotificationType) {
  switch (type) {
    case "qualified_lead":
      return "Qualified lead";
    case "review_needed":
      return "Review needed";
    case "crm_sync_failure":
      return "CRM sync failure";
    case "document_processing_failure":
      return "Document processing failure";
  }
}

export function buildSlackBlocks(input: SlackNotificationTemplateInput) {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${getContextLabel(input.type)}: ${input.title}`,
        emoji: true,
      },
    },
  ];

  if (input.body) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: input.body,
      },
    });
  }

  if (input.fields.length > 0) {
    blocks.push({
      type: "section",
      fields: input.fields.map((field) => ({
        type: "mrkdwn",
        text: `*${field.label}*\n${field.value}`,
      })),
    });
  }

  if (input.linkUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: input.linkLabel ?? "Open in app",
            emoji: true,
          },
          url: input.linkUrl,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${getEmoji(input.type)} Ops Automation Hub${input.channelName ? ` - ${input.channelName}` : ""}`,
      },
    ],
  });

  return blocks;
}
