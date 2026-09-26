// The one place the Notion links for /media live. These are the logged-in,
// editable app.notion.com links (not the public notion.site link, which cannot
// be shown inside this site and is read only).

export const NOTION_CMS_URL = 'https://app.notion.com/p/ed530905fc38831bafaf81ba49bbc71f';

export const NOTION_DASHBOARDS = [
  { label: 'Long Form', url: 'https://app.notion.com/p/3e730905fc388029859af47acbabb654' },
  { label: 'Long to Short (LTS)', url: 'https://app.notion.com/p/3e330905fc3880d8868ccf516996ed8f' },
  { label: 'Short Form', url: 'https://app.notion.com/p/3e330905fc3880909538c60190fb85e8' },
  { label: 'Ads', url: 'https://app.notion.com/p/3e730905fc3880dc830ae0668f55a8f4' },
  { label: 'VSLs', url: 'https://app.notion.com/p/3e730905fc3880ff8d8be07933d5b66f' },
] as const;
