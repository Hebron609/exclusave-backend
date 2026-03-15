# Vendor Automation (Cron)

## Fee Reminder Cron

Use a scheduler (Vercel Cron or GitHub Actions) to call:

```
POST https://your-backend.vercel.app/api/vendors/fees/remind
```

Body:

```
{
  "daysAhead": 3
}
```

This emails vendors whose `nextFeeDueAt` is within the next 3 days.

## Notes

- Ensure `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are set.
- Requires vendors with `status = approved` and `nextFeeDueAt` set.
