import { useQuery } from '@tanstack/react-query';
import { systemAPI } from '../services/api';
import { WEB_APP_VERSION, WEB_BUILD_NUMBER, WEB_BUILD_DATE, WEB_BUILD_SHA } from '../version';

type Section = {
  title: string;
  items: string[];
};

export default function HelpPage() {
  const { data: health } = useQuery({
    queryKey: ['help-api-health-version'],
    queryFn: systemAPI.health,
    staleTime: Infinity,
  });
  const apiVersion = health?.version || 'unknown';
  const apiBuildNumber = health?.build?.number || 'unknown';
  const apiBuildDate = health?.build?.date || 'unknown';
  const apiBuildSha = health?.build?.commit || 'unknown';

  const webBuildInfo = WEB_BUILD_NUMBER !== 'unknown' || WEB_BUILD_DATE !== 'unknown' || WEB_BUILD_SHA !== 'unknown'
    ? ` (build ${WEB_BUILD_NUMBER} ${WEB_BUILD_DATE} ${WEB_BUILD_SHA})`
    : '';

  const apiBuildInfo = apiBuildNumber !== 'unknown' || apiBuildDate !== 'unknown' || apiBuildSha !== 'unknown'
    ? ` (build ${apiBuildNumber} ${apiBuildDate} ${apiBuildSha})`
    : '';

  const versionLabel = `Version: Web v${WEB_APP_VERSION}${webBuildInfo} | API v${apiVersion}${apiBuildInfo}`;

  const sections: Section[] = [
    {
      title: 'Roles & Access',
      items: [
        'Admin: full access to all stores, users, and business member approvals.',
        'Store Manager: access assigned stores and manage day-to-day operations.',
        'Staff: operational pages for assigned store scope only.',
        'Business Member: uses My Business page, not staff management pages.',
      ],
    },
    {
      title: 'Store Scope',
      items: [
        'Admins can switch store context from the sidebar store selector.',
        'Managers can switch only among stores assigned to them.',
        'Staff are auto-scoped by assignment and do not switch store in UI.',
      ],
    },
    {
      title: 'Daily Workflows',
      items: [
        'Operations: manage appointments, charges, orders, and products.',
        'Store Management (admin): add/edit/deactivate stores in Configuration -> Stores.',
        'Members (admin): assign Store Manager / Staff to one or multiple stores.',
        'Business Members: review pending applications inside Business Members page.',
        'Feedback (admin): review member suggestions in Configuration -> Feedback.',
        'Configuration: set services and store settings by current store context.',
      ],
    },
    {
      title: 'Advisor RAG (Demo)',
      items: [
        'What it does: advisor answers from your own uploaded documents, not only from generic model memory.',
        'Where to try it: Web -> Analysis -> RAG Demo page, or rides-app -> Advisor chat.',
        'How to test: 1) Ingest a doc, 2) Run Retrieve to see matched snippets, 3) Run Ask to get grounded answer.',
        'Safety: manager/staff only see data in their store scope.',
        'Current quality: keyword match (good for clear SOP/FAQ text). Embeddings can be added later.',
      ],
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard Help</h1>
        <p>Quick guide for roles, store scope, and daily workflows.</p>
      </div>

      <div className="panel">
        <div className="panel-body">
          {sections.map((section) => (
            <div key={section.title} className="help-section">
              <h3>{section.title}</h3>
              <ul className="help-list">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
          <div className="help-version">{versionLabel}</div>
        </div>
      </div>
    </div>
  );
}
