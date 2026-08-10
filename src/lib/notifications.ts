// Copy for in-app alerts, kept in one place so triggers and tests share it.

export const SHOP_APPROVED_NOTIFICATION = {
  type: "shop_approved",
  title: "You're in! Welcome to the Premium Growth Portal",
  body:
    "Congratulations on your acceptance into the Premium Growth Portal! Your " +
    "welcome packet is on the way — including swag and 500 oil change stickers.",
} as const;

/**
 * An admin replied in a support thread (R10). Alerting reuses the existing
 * shop-addressed Notification model and bell (KTD3) — there is no admin-side
 * notification row. The subject is interpolated so the bell says which thread
 * moved; the type stays stable so the client can route the click.
 */
export const SUPPORT_REPLY_NOTIFICATION_TYPE = "support_reply";

export function supportReplyNotification(subject: string) {
  return {
    type: SUPPORT_REPLY_NOTIFICATION_TYPE,
    title: "New reply to your support request",
    body: `The Premium Growth Portal team replied to "${subject}".`,
  } as const;
}
