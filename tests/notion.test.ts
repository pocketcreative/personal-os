import { describe, it, expect } from 'vitest';
import { NOTION_CMS_URL, NOTION_DASHBOARDS } from '@/lib/notion';

const ALL = [NOTION_CMS_URL, ...NOTION_DASHBOARDS.map((d) => d.url)];

describe('notion links', () => {
  it('has the five dashboards', () => {
    expect(NOTION_DASHBOARDS.map((d) => d.label)).toEqual([
      'Long Form', 'Long to Short (LTS)', 'Short Form', 'Ads', 'VSLs',
    ]);
  });
  it('every link is an https app.notion.com link, never the public notion.site one', () => {
    for (const link of ALL) {
      const url = new URL(link);
      expect(url.protocol).toBe('https:');
      expect(url.hostname).toBe('app.notion.com');
    }
  });
  it('no link is used twice', () => {
    expect(new Set(ALL).size).toBe(ALL.length);
  });
});
