# Templates

## Current behavior

The Templates page is the central place for document-generation templates used
by Kammie and the account Documents tab.

## Layout

- The page opens with a clean Templates hero and one primary upload action.
- Template upload happens in a focused modal instead of always showing form
  controls on the page.
- Empty template categories are not shown as separate cards. If no templates
  exist, the page shows one empty state.
- Once templates are uploaded, the page groups only the document tags that
  actually have templates.

## Upload

Users can upload any file type and tag it as one of the supported generated
document types:

- QBR
- MBR
- DBR
- EBR
- KYC
- Account Brief
- Renewal Plan
- Risk Memo
- Executive Summary

Uploaded templates are stored in browser local storage for the prototype. The
file is saved as an openable data URL so it can still be previewed after a page
refresh.

## Generated formats

The supported output formats are:

- pptx
- docx
- pdf
- xlsx

Templates are sent as context to the V2 Kammie route. The document-generation
agent uses matching templates as structure and style guidance while keeping
facts grounded in account context and user answers.
