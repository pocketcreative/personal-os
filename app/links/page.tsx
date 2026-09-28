// /links: Brendan's main links reference. Static list he asked for over
// Telegram (2026-09-28) -- every link opens in a new tab, and each
// trigger_link code is shown as plain copyable text for pasting into GHL
// automations. This is a hand-maintained reference, not a database table:
// when a link or code changes, Brendan asks for this file to be edited.

type LinkRow = {
  name: string;
  url: string | null;
  urlNote?: string;
  trigger: string | null;
  live: boolean;
};

const LINKS: LinkRow[] = [
  {
    name: 'Home Page',
    url: 'https://acquireclients.ai/links',
    trigger: '{{trigger_link.icSTXEwknsKSYSn7ghOS}}',
    live: false,
  },
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/brendanangg',
    trigger: '-',
    live: true,
  },
  {
    name: 'YouTube',
    url: 'https://www.youtube.com/@brendanangg?sub_confirmation=1',
    trigger: '-',
    live: true,
  },
  {
    name: 'Growth Roadmap',
    url: 'https://acquireclients.ai/roadmap',
    trigger: '{{trigger_link.ibJVjoFspT4B6vnqHg9S}}',
    live: true,
  },
  {
    name: 'Workshop Page',
    url: 'https://acquireclients.ai/workshop',
    trigger: '{{trigger_link.UbDzhr1762C2rgNIPtQ9}}',
    live: false,
  },
  {
    name: 'Partnership Page',
    url: 'https://acquireclients.ai/apply',
    trigger: '{{trigger_link.iDF2bZq9eshAkP1jOcEe}}',
    live: false,
  },
  {
    name: 'Partnership Pre-Frame Page',
    url: 'https://acquireclients.ai/confirm',
    trigger: '{{trigger_link.oG5O9Nk3ufn3d4XvKUus}}',
    live: false,
  },
  {
    name: 'Podcast Page',
    url: 'https://acquireclients.ai/joinpodcast',
    trigger: '{{trigger_link.ztf1eOA6lj1ua3e9xl4v}}',
    live: false,
  },
  {
    name: 'Results Page',
    url: 'https://acquireclients.ai/results',
    trigger: '{{trigger_link.QhqyS8hC96qnyG3Vpgfq}}',
    live: false,
  },
  {
    name: 'AA Playbook',
    url: 'https://gamma.app/docs/Authority-Agent-Method-Playbook-q5gl5nro9fluqct?mode=doc',
    trigger: '{{trigger_link.0YTXVTU4wFWJsfAuVE9b}}',
    live: false,
  },
  {
    name: 'Partnership Payment Link',
    url: 'https://link.fastpaydirect.com/payment-link/6aa8d4d1ceb12d9fc1a8ceed',
    trigger: null,
    live: false,
  },
  {
    name: 'Workshop Payment Link',
    url: 'https://link.fastpaydirect.com/payment-link/6ab60c6a4ae1d4567283981f',
    trigger: null,
    live: false,
  },
];

export default function LinksPage() {
  return (
    <div className="links-page">
      <h1 className="links-page-title">Links</h1>
      <p className="links-page-intro">
        Brendan&apos;s main links, one place. Trigger codes are plain text, ready to paste into GHL.
      </p>

      <div className="links-page-table-wrap">
        <table className="links-page-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Link</th>
              <th>Trigger Link (Automations)</th>
              <th>Live &amp; Tested</th>
            </tr>
          </thead>
          <tbody>
            {LINKS.map((row) => (
              <tr key={row.name}>
                <td className="links-page-name">{row.name}</td>
                <td>
                  {row.url ? (
                    <a href={row.url} target="_blank" rel="noopener noreferrer">
                      {row.url}
                    </a>
                  ) : (
                    <span className="links-page-note">{row.urlNote}</span>
                  )}
                </td>
                <td>
                  {row.trigger ? <code className="links-page-code">{row.trigger}</code> : null}
                </td>
                <td>
                  {row.live ? <span className="links-page-badge">Yes</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
