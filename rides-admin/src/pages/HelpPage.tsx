import { useI18n } from '../i18n/I18nContext';
import { useQuery } from '@tanstack/react-query';
import { systemAPI } from '../services/api';
import { WEB_APP_VERSION, WEB_BUILD_DATE, WEB_BUILD_SHA } from '../version';

type Section = {
  title: string;
  items: string[];
};

export default function HelpPage() {
  const { t, lang } = useI18n();
  const { data: health } = useQuery({
    queryKey: ['help-api-health-version'],
    queryFn: systemAPI.health,
    staleTime: Infinity,
  });
  const apiVersion = health?.version || 'unknown';
  const apiBuildDate = health?.build?.date || 'unknown';
  const apiBuildSha = health?.build?.commit || 'unknown';
  const webBuildInfo = WEB_BUILD_DATE !== 'unknown' || WEB_BUILD_SHA !== 'unknown'
    ? lang === 'zh' ? `（构建 ${WEB_BUILD_DATE} ${WEB_BUILD_SHA}）` : ` (build ${WEB_BUILD_DATE} ${WEB_BUILD_SHA})`
    : '';
  const apiBuildInfo = apiBuildDate !== 'unknown' || apiBuildSha !== 'unknown'
    ? lang === 'zh' ? `（构建 ${apiBuildDate} ${apiBuildSha}）` : ` (build ${apiBuildDate} ${apiBuildSha})`
    : '';
  const versionLabel = lang === 'zh'
    ? `版本：Web v${WEB_APP_VERSION}${webBuildInfo} · API v${apiVersion}${apiBuildInfo}`
    : `Version: Web v${WEB_APP_VERSION}${webBuildInfo} · API v${apiVersion}${apiBuildInfo}`;

  const sections: Section[] = [
    {
      title: t('help.roles.title'),
      items: [
        t('help.roles.admin'),
        t('help.roles.manager'),
        t('help.roles.staff'),
        t('help.roles.business'),
      ],
    },
    {
      title: t('help.stores.title'),
      items: [
        t('help.stores.admin'),
        t('help.stores.manager'),
        t('help.stores.staff'),
      ],
    },
    {
      title: t('help.workflows.title'),
      items: [
        t('help.workflows.operations'),
        t('help.workflows.storeMgmt'),
        t('help.workflows.userAssignments'),
        t('help.workflows.businessReview'),
        t('help.workflows.feedback'),
        t('help.workflows.settings'),
      ],
    },
    {
      title: t('help.rag.title'),
      items: [
        t('help.rag.what'),
        t('help.rag.demoMobile'),
        t('help.rag.demoApi'),
        t('help.rag.scope'),
        t('help.rag.limit'),
      ],
    },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>{t('help.title')}</h1>
        <p>{t('help.subtitle')}</p>
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
