# Account Journey Configuration

## Current behavior

The Account Journey Configuration page lets a user edit the default account journey template used during new account onboarding. The template uses relative timing, not hard calendar dates, because the real due dates are calculated only after an account is created.

## Layout

- The default journey is shown as a horizontal timeline.
- Each timeline card shows the relative interval from account creation, such as `Day 7` and `1 week after account creation`.
- Timeline cards contain edit and delete controls directly on the card.
- There is no separate manual item list; the timeline is the primary editing surface.
- Save and cancel actions are available in the page header.

## Editing

Users can add a new item or edit an existing timeline item.

Editable fields:

- Type: To-do, Meeting, or QBR
- Starts after account creation, captured as a number of days
- Title
- Recurrence
- Details

Recurrence is selected from:

- Does not repeat
- Daily
- Weekly
- Bi-weekly
- Monthly
- Quarterly
- Yearly

When the template is used in the new account setup flow, each interval is resolved into a hard due date based on the account creation date. For example, a template item set to 7 days after account creation becomes an actual due date one week after the account draft is started or created.

## Journey assistant

The Journey assistant is a conversational panel on the page.

It can interpret simple commands to propose:

- Add journey items
- Remove journey items
- Update renewal-related journey items
- Update QBR-related journey items

Assistant changes are staged first as proposed changes. The user must click
`Apply suggestion` or explicitly tell the assistant to apply/accept before the
draft journey is changed. The user still needs to save the final version.
