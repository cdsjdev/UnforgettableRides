import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../i18n/I18nContext';
import { useWebLayout } from '../utils/webStyles';
import { healthCheck } from '../services/api';
import { APP_BUILD_DATE, APP_BUILD_SHA, APP_VERSION } from '../version';

interface HelpSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function HelpSection({ title, icon, children, defaultOpen = false }: HelpSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setIsOpen(!isOpen)}
        activeOpacity={0.7}
      >
        <View style={styles.sectionTitleRow}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={20} color="#3B82F6" />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Ionicons
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6B7280"
        />
      </TouchableOpacity>
      {isOpen && <View style={styles.sectionContent}>{children}</View>}
    </View>
  );
}

interface InfoCardProps {
  title: string;
  description: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
}

function InfoCard({ title, description, icon, color = '#3B82F6' }: InfoCardProps) {
  return (
    <View style={styles.infoCard}>
      {icon && (
        <View style={[styles.infoCardIcon, { backgroundColor: `${color}15` }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
      )}
      <View style={styles.infoCardContent}>
        <Text style={styles.infoCardTitle}>{title}</Text>
        <Text style={styles.infoCardDescription}>{description}</Text>
      </View>
    </View>
  );
}

interface TableRowProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function TableRow({ label, value, highlight = false }: TableRowProps) {
  return (
    <View style={[styles.tableRow, highlight && styles.tableRowHighlight]}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue}>{value}</Text>
    </View>
  );
}

export default function HelpScreen() {
  const { t } = useI18n();
  const { containerStyle } = useWebLayout('content');
  const L = (en: string, _zh: string) => en;
  const [apiVersion, setApiVersion] = useState<string>('...');
  const [serverBuildDate, setServerBuildDate] = useState<string>('unknown');
  const [serverBuildSha, setServerBuildSha] = useState<string>('unknown');

  useEffect(() => {
    let mounted = true;
    healthCheck()
      .then((data) => {
        if (!mounted) return;
        setApiVersion(data?.version || 'unknown');
        const buildDate = data?.build?.date || 'unknown';
        const buildCommit = data?.build?.commit || 'unknown';
        setServerBuildDate(buildDate);
        setServerBuildSha(buildCommit === 'unknown' ? 'unknown' : buildCommit.slice(0, 7));
      })
      .catch(() => {
        if (!mounted) return;
        setApiVersion('unknown');
        setServerBuildDate('unknown');
        setServerBuildSha('unknown');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const effectiveBuildDate = serverBuildDate !== 'unknown' ? serverBuildDate : APP_BUILD_DATE;
  const effectiveBuildSha = serverBuildSha !== 'unknown' ? serverBuildSha : APP_BUILD_SHA;

  return (
    <ScrollView style={styles.container} contentContainerStyle={containerStyle}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="help-circle" size={48} color="#3B82F6" />
        </View>
        <Text style={styles.headerTitle}>{t('help.title')}</Text>
        <Text style={styles.headerSubtitle}>
          {t('help.subtitle')}
        </Text>
      </View>

      {/* Quick Start */}
      <HelpSection title={t('help.quickStart')} icon="rocket" defaultOpen={true}>
        <View style={styles.stepsContainer}>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{L('Take Photos', '拍摄照片')}</Text>
              <Text style={styles.stepDescription}>
                {L(
                  'Tap "Scan Dog" and take 1-3 clear photos of your dog showing their full body and coat.',
                  '点击“扫描狗狗”，拍摄 1-3 张清晰照片，尽量包含狗狗全身和毛发细节。',
                )}
              </Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{L('Review Results', '查看结果')}</Text>
              <Text style={styles.stepDescription}>
                {L(
                  'Our AI identifies the breed and coat characteristics like size, coat type, and shedding level.',
                  'AI 会识别品种及毛发特征，包括体型、毛发类型和掉毛等级。',
                )}
              </Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{L('Get Recommendation', '获取建议')}</Text>
              <Text style={styles.stepDescription}>
                {L(
                  'Receive a personalized wash cycle recommendation and generate a QR code for your machine.',
                  '获取个性化洗护方案，并生成设备可用的二维码。',
                )}
              </Text>
            </View>
          </View>
        </View>
      </HelpSection>

      {/* Understanding Coats */}
      <HelpSection title={t('help.coats')} icon="leaf">
        <Text style={styles.paragraph}>
          {L(
            "Dogs have different coat types that require different care. Understanding your dog's coat ensures a safe, effective wash.",
            '不同狗狗的毛发类型需要不同护理方式。了解毛发特征可以让洗护更安全、更有效。',
          )}
        </Text>

        <Text style={styles.subheading}>{L('Single vs Double Coat', '单层毛与双层毛')}</Text>

        <InfoCard
          title={L('Single Coat', '单层毛')}
          description={L(
            'One layer of fur. Easier to wash and dry. Examples: Poodle, Maltese, Boxer',
            '只有一层毛，清洗和吹干相对更容易。示例：贵宾、马尔济斯、拳师犬。',
          )}
          icon="remove-outline"
          color="#10B981"
        />

        <InfoCard
          title={L('Double Coat', '双层毛')}
          description={L(
            'Two layers - outer guard hairs for protection and soft undercoat for insulation. Needs thorough washing and complete drying. Examples: Husky, Golden Retriever, German Shepherd',
            '两层结构：外层护毛用于保护，内层底毛用于保温。需要更彻底清洗和完全吹干。示例：哈士奇、金毛、德牧。',
          )}
          icon="reorder-two-outline"
          color="#F59E0B"
        />

        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color="#DC2626" />
          <Text style={styles.warningText}>
            {L(
              'Never shave a double-coated dog! Their coat provides natural temperature regulation for both hot and cold weather.',
              '不要给双层毛犬剃光毛发。其毛发可帮助在冷热环境中自然调节体温。',
            )}
          </Text>
        </View>
      </HelpSection>

      {/* Coat Types */}
      <HelpSection title={t('help.coatTypes')} icon="color-palette">
        <Text style={styles.subheading}>{L('By Length', '按长度')}</Text>
        <TableRow label={L('Short', '短毛')} value={L('< 1 inch (Beagle, Boxer)', '< 1 英寸（比格、拳师）')} />
        <TableRow label={L('Medium', '中毛')} value={L('1-3 inches (Golden Retriever)', '1-3 英寸（金毛）')} highlight />
        <TableRow label={L('Long', '长毛')} value={L('> 3 inches (Shih Tzu, Afghan)', '> 3 英寸（西施、阿富汗犬）')} />

        <Text style={[styles.subheading, { marginTop: 16 }]}>{L('By Texture', '按质地')}</Text>
        <TableRow label={L('Smooth', '顺滑')} value={L('Sleek, close-fitting', '贴身顺滑')} />
        <TableRow label={L('Wire/Rough', '刚毛/粗毛')} value={L('Coarse, bristly (Terriers)', '粗硬刺感（梗犬常见）')} highlight />
        <TableRow label={L('Curly', '卷毛')} value={L('Tight curls (Poodle)', '紧密卷曲（贵宾）')} />
        <TableRow label={L('Silky', '丝质毛')} value={L('Fine, flowing (Setter)', '细软顺垂（雪达犬）')} highlight />
      </HelpSection>

      {/* Shedding */}
      <HelpSection title={t('help.sheddingLevels')} icon="water">
        <InfoCard
          title={L('Low Shedding', '低掉毛')}
          description={L('Minimal shedding, may need regular haircuts. Great for allergy sufferers.', '掉毛少，可能需要规律修剪，对过敏人群更友好。')}
          icon="sunny-outline"
          color="#10B981"
        />
        <InfoCard
          title={L('Medium Shedding', '中等掉毛')}
          description={L('Moderate year-round shedding. Regular brushing helps manage loose fur.', '全年中等掉毛，定期梳毛可减少浮毛。')}
          icon="partly-sunny-outline"
          color="#F59E0B"
        />
        <InfoCard
          title={L('High Shedding', '高掉毛')}
          description={L("Heavy shedding, especially during seasonal 'coat blowing' in spring and fall.", '掉毛较多，尤其在春秋换毛季更明显。')}
          icon="snow-outline"
          color="#EF4444"
        />
      </HelpSection>

      {/* Size Classes */}
      <HelpSection title={t('help.sizeClasses')} icon="resize">
        <Text style={styles.paragraph}>
          {L('Size affects wash parameters like water volume, pressure, and cycle duration.', '体型会影响用水量、水压和洗护时长等参数。')}
        </Text>
        <TableRow label={L('XS (Extra Small)', 'XS（超小型）')} value={L('Under 10 lbs', '10 磅以下')} />
        <TableRow label={L('S (Small)', 'S（小型）')} value={L('10-25 lbs', '10-25 磅')} highlight />
        <TableRow label={L('M (Medium)', 'M（中型）')} value={L('25-50 lbs', '25-50 磅')} />
        <TableRow label={L('L (Large)', 'L（大型）')} value={L('50-80 lbs', '50-80 磅')} highlight />
        <TableRow label={L('XL (Extra Large)', 'XL（超大型）')} value={L('Over 80 lbs', '80 磅以上')} />
      </HelpSection>

      {/* Wash Cycles */}
      <HelpSection title={t('help.washCycles')} icon="water">
        <InfoCard
          title={L('Safe Standard', '标准安全')}
          description={L('Balanced settings for most dogs with normal coats. Good for regular maintenance.', '适用于大多数普通毛发犬只，参数均衡，适合日常维护。')}
          icon="shield-checkmark"
          color="#3B82F6"
        />
        <InfoCard
          title={L('Double Coat De-shed', '双层毛去浮毛')}
          description={L('Extended rinse and higher dryer settings to thoroughly clean and dry double coats.', '延长冲洗并提高烘干强度，适合双层毛彻底清洁与干燥。')}
          icon="layers"
          color="#F59E0B"
        />
        <InfoCard
          title={L('Sensitive Skin', '敏感肌')}
          description={L('Hypoallergenic shampoo, lukewarm water, and gentle pressure for sensitive dogs.', '使用低敏洗护、温水和较柔和水压，适合敏感犬只。')}
          icon="heart"
          color="#EC4899"
        />
        <InfoCard
          title={L('Curly Coat', '卷毛护理')}
          description={L('Includes conditioning to prevent matting and maintain curl definition.', '包含护毛步骤，减少打结并维持卷毛状态。')}
          icon="infinite"
          color="#8B5CF6"
        />
        <InfoCard
          title={L('Heavy Dirt', '重污清洁')}
          description={L('Pre-rinse and extended wash for muddy or heavily soiled dogs.', '适用于泥污较重情况，包含预冲洗与延长清洗。')}
          icon="cloud"
          color="#6B7280"
        />
        <InfoCard
          title={L('Short & Smooth', '短毛快洗')}
          description={L('Quick, efficient cycle optimized for easy-care short coats.', '针对易护理短毛优化，快速高效。')}
          icon="flash"
          color="#10B981"
        />
        <InfoCard
          title={L('Puppy First Wash', '幼犬首次洗护')}
          description={L('Extra gentle settings to help puppies get comfortable with washing.', '更温和参数，帮助幼犬建立洗护适应。')}
          icon="paw"
          color="#F472B6"
        />
      </HelpSection>

      {/* Photo Tips */}
      <HelpSection title={t('help.photoTips')} icon="camera">
        <View style={styles.tipsList}>
          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>{L('Use good, natural lighting', '使用充足自然光')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>{L('Get the whole dog in frame', '尽量拍到狗狗全身')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>{L("Take photos at dog's eye level", '尽量在狗狗视线高度拍摄')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>{L('Keep the dog still for sharp images', '保持稳定，避免画面模糊')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
            <Text style={styles.tipText}>{L('Avoid using flash', '尽量避免使用闪光灯')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
            <Text style={styles.tipText}>{L("Don't crop out parts of the body", '不要裁掉身体关键部位')}</Text>
          </View>
        </View>
      </HelpSection>

      {/* Voice Booking */}
      <HelpSection title={t('help.voiceBooking')} icon="mic">
        <Text style={styles.paragraph}>
          {L('Book appointments quickly using your voice or by typing a natural language description.', '你可以通过语音或自然语言文本快速完成预约。')}
        </Text>

        <Text style={styles.subheading}>{L('How to Use', '使用方式')}</Text>
        <InfoCard
          title={L('Tap to Speak', '点击说话')}
          description={L(
            'Press the mic button on the Book Appointment screen, describe your appointment, then tap again to stop. Your speech is transcribed and parsed automatically.',
            '在预约页面点击麦克风，说出预约需求，再次点击停止。系统会自动转写并解析。',
          )}
          icon="mic"
          color="#7C3AED"
        />
        <InfoCard
          title={L('Type It', '文字输入')}
          description={L(
            'You can also type your request in the text box. Example: "Groom for Buddy Friday at 10am"',
            '也可以直接输入需求，例如：“周五上午10点给 Buddy 做美容”。',
          )}
          icon="create-outline"
          color="#3B82F6"
        />

        <Text style={styles.subheading}>{L('What You Can Say', '可包含信息')}</Text>
        <View style={styles.tipsList}>
          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>{L('Dog name, service, date, and time', '狗狗名字、服务类型、日期和时间')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>{L('Your name and phone number', '你的姓名和联系电话')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.tipText}>{L('Special notes (e.g. "I may be late")', '补充说明（如“我可能会晚到”）')}</Text>
          </View>
        </View>

        <View style={styles.warningBox}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={[styles.warningText, { color: '#1E40AF' }]}>
            {L(
              'Voice recording requires an OpenAI API key for Whisper transcription. Text parsing works with any configured AI provider.',
              '语音录入需要 OpenAI Key 用于 Whisper 转写；文本解析可使用任一已配置 AI 服务。',
            )}
          </Text>
        </View>
      </HelpSection>

      {/* AI Advisor */}
      <HelpSection title={t('help.aiAdvisor')} icon="chatbubble-ellipses">
        <Text style={styles.paragraph}>
          {L(
            "The AI Advisor is your personal pet care assistant. Ask questions about your dogs' health, grooming, nutrition, behavior, and more.",
            'AI 顾问是你的宠物护理助手，可咨询健康、洗护、营养、行为等问题。',
          )}
        </Text>

        <Text style={styles.subheading}>{L('What It Knows', '可用信息')}</Text>
        <InfoCard
          title={L("Your Dogs' Data", '你的狗狗数据')}
          description={L(
            "The advisor has access to your dogs' breed, traits, health info, care history, and wash records to give personalized advice.",
            '顾问可参考狗狗品种、特征、健康信息、护理历史和洗护记录，提供个性化建议。',
          )}
          icon="paw"
          color="#3B82F6"
        />
        <InfoCard
          title={L('Suggested Actions', '建议动作')}
          description={L(
            'The advisor may suggest actions like booking an appointment, logging a care event, or scanning your dog. You can execute them directly from the chat.',
            '顾问可能建议你预约、记录护理事件或扫描狗狗，并可在聊天中直接执行。',
          )}
          icon="flash"
          color="#F59E0B"
        />

        <Text style={styles.subheading}>{L('Supported Providers', '支持的服务')}</Text>
        <Text style={styles.paragraph}>
          {L(
            'The advisor works with OpenAI (ChatGPT), Anthropic (Claude), or Google (Gemini). It automatically tries each provider in order. You can set your preferred provider in Settings.',
            '顾问支持 OpenAI（ChatGPT）、Anthropic（Claude）和 Google（Gemini）。系统会按顺序自动尝试，你也可在设置中指定首选服务。',
          )}
        </Text>
      </HelpSection>

      {/* AI Settings */}
      <HelpSection title={t('help.aiSettingsSection')} icon="settings">
        <Text style={styles.paragraph}>
          {L('Configure your AI provider API keys and preferences. Access Settings from the gear icon in the header.', '可在此配置 AI 服务 API Key 和偏好。通过页面顶部齿轮图标进入设置。')}
        </Text>

        <Text style={styles.subheading}>{L('API Keys', 'API 密钥')}</Text>
        <InfoCard
          title={L('Privacy First', '隐私优先')}
          description={L(
            'API keys are stored only on your device. They are sent to the PetCare server per-request over HTTPS and are never stored on the server.',
            'API 密钥仅保存在你的设备本地。每次请求经 HTTPS 发送，不会保存在服务器。',
          )}
          icon="shield-checkmark"
          color="#059669"
        />
        <InfoCard
          title="OpenAI"
          description={L('Required for voice recording (Whisper). Also powers the AI advisor and breed analysis via GPT-4o.', '语音录入（Whisper）需要 OpenAI，同时可用于 AI 顾问与品种分析。')}
          icon="chatbubble-ellipses-outline"
          color="#10A37F"
        />
        <InfoCard
          title={L('Anthropic (Claude)', 'Anthropic（Claude）')}
          description={L('Powers the AI advisor, voice text parsing, and breed analysis. Often gives the most detailed responses.', '用于 AI 顾问、语音文本解析与品种分析，回答通常更细致。')}
          icon="sparkles-outline"
          color="#D97706"
        />
        <InfoCard
          title="Google Gemini"
          description={L('Powers the AI advisor, voice text parsing, and breed analysis. Fast and cost-effective.', '用于 AI 顾问、语音文本解析与品种分析，速度快、成本低。')}
          icon="diamond-outline"
          color="#4285F4"
        />

        <Text style={styles.subheading}>{L('Preferred Provider', '首选服务')}</Text>
        <Text style={styles.paragraph}>
          {L(
            'Choose which AI to use first. "Auto" tries providers in the default order. If your preferred provider fails, others are tried automatically.',
            '可设置优先使用的 AI 服务。“自动”会按默认顺序尝试；若首选失败会自动回退到其他服务。',
          )}
        </Text>
      </HelpSection>

      {/* Breed Analysis */}
      <HelpSection title={t('help.breedAnalysis')} icon="scan">
        <Text style={styles.paragraph}>
          {L("PetCare uses a hybrid approach to identify your dog's breed with the highest accuracy possible.", 'PetCare 使用混合识别方案，以尽可能提高品种识别准确率。')}
        </Text>

        <Text style={styles.subheading}>{L('How It Works', '工作方式')}</Text>
        <InfoCard
          title={L('AI Vision (Primary)', 'AI 视觉（主方案）')}
          description={L(
            'An AI vision model (GPT-4o, Claude, or Gemini) analyzes your photos first for the best accuracy and contextual understanding.',
            '优先使用 AI 视觉模型（GPT-4o、Claude 或 Gemini）分析图片，获取更高准确率与上下文理解。',
          )}
          icon="hardware-chip-outline"
          color="#7C3AED"
        />
        <InfoCard
          title={L('ML Service (Fallback)', 'ML 服务（回退）')}
          description={L(
            "If AI Vision is unavailable, PetCare falls back to a specialized machine learning model (Stanford Dogs ViT). It's fast, free, and robust.",
            '若 AI 视觉不可用，系统会回退到专用机器学习模型（Stanford Dogs ViT），稳定且快速。',
          )}
          icon="sparkles-outline"
          color="#059669"
        />
        <InfoCard
          title={L('Edit Breed', '手动修正品种')}
          description={L(
            'You can always tap the breed name on the results screen to correct it manually if the detection is wrong.',
            '若识别有误，可在结果页点击品种名称进行手动修改。',
          )}
          icon="pencil"
          color="#F59E0B"
        />

        <Text style={styles.subheading}>{L('Source Indicators', '结果来源标识')}</Text>
        <Text style={styles.paragraph}>
          {L(
            'A badge on the results screen shows which analysis method was used: "AI Vision" (LLM), "ML" (ViT fallback), or "Mock" (last-resort fallback).',
            '结果页会显示来源标签："AI Vision"（大模型）、"ML"（ViT 回退）或 "Mock"（最后兜底）。',
          )}
        </Text>
      </HelpSection>

      {/* Shopping */}
      <HelpSection title={t('help.shoppingOrders')} icon="cart">
        <Text style={styles.paragraph}>
          {L('Browse and purchase pet care products directly from the app.', '可在 App 内直接浏览并购买宠物用品。')}
        </Text>

        <Text style={styles.subheading}>{t('help.businessMembershipTitle')}</Text>
        <Text style={styles.paragraph}>
          {t('help.businessMembershipDesc')}
        </Text>
        <View style={styles.tipBox}>
          <Ionicons name="pricetag" size={16} color="#D97706" />
          <Text style={styles.tipBoxText}>{t('help.businessMembershipTip')}</Text>
        </View>

        <Text style={styles.subheading}>{t('help.businessMembershipApplyFlowTitle')}</Text>
        <Text style={styles.paragraph}>{t('help.businessMembershipApplyFlowDesc')}</Text>
        <View style={styles.tipRow}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.tipText}>{t('help.businessMembershipApplyFlowStep1')}</Text>
        </View>
        <View style={styles.tipRow}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.tipText}>{t('help.businessMembershipApplyFlowStep2')}</Text>
        </View>
        <View style={styles.tipRow}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.tipText}>{t('help.businessMembershipApplyFlowStep3')}</Text>
        </View>

        <Text style={styles.subheading}>{L('How to Shop', '购物步骤')}</Text>
        <View style={styles.stepsContainer}>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{L('Browse Products', '浏览商品')}</Text>
              <Text style={styles.stepDescription}>
                {L('Go to the Shop tab to browse products. Filter by category or search by name.', '进入“商城”标签页浏览商品，可按分类筛选或按名称搜索。')}
              </Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{L('Add to Cart', '加入购物车')}</Text>
              <Text style={styles.stepDescription}>
                {L(
                  'Tap a product to see details, select quantity, and add to your cart. The cart badge on the Shop tab shows your item count.',
                  '点击商品查看详情并选择数量后加入购物车；“商城”标签上的角标会显示商品数量。',
                )}
              </Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{L('Checkout', '结账下单')}</Text>
              <Text style={styles.stepDescription}>
                {t('help.checkoutStepUpdated')}
              </Text>
            </View>
          </View>
        </View>
      </HelpSection>

      {/* Daily Care */}
      <HelpSection title={t('help.dailyCare')} icon="heart">
        <Text style={styles.paragraph}>
          {L("Track your dog's daily care routine with quick-log buttons and maintain care streaks.", '通过快捷记录按钮追踪日常护理，并持续积累护理连续天数。')}
        </Text>

        <Text style={styles.subheading}>{L('Care Categories', '护理分类')}</Text>
        <TableRow label={L('Brushing', '梳毛')} value={L('Coat brushing & detangling', '梳理毛发与解结')} />
        <TableRow label={L('Ear Care', '耳部护理')} value={L('Ear cleaning & inspection', '耳道清洁与检查')} highlight />
        <TableRow label={L('Nail Care', '指甲护理')} value={L('Nail trimming & filing', '修剪与打磨')} />
        <TableRow label={L('Exercise', '运动')} value={L('Walks, play, & activity', '散步、玩耍与活动')} highlight />

        <Text style={[styles.subheading, { marginTop: 16 }]}>{L('Streaks & History', '连续记录与历史')}</Text>
        <Text style={styles.paragraph}>
          {L('Log care events daily to build streaks. View your full care history from the clock icon on the Care tab header.', '每日记录护理可形成连续天数。可在护理页顶部的时钟图标查看完整历史。')}
        </Text>
      </HelpSection>

      {/* Appointments */}
      <HelpSection title={t('help.appointmentsSection')} icon="calendar">
        <Text style={styles.paragraph}>
          {L('Book grooming appointments from the Care tab. Choose from Bath/Wash, Grooming, Nail Trim, or Full Service.', '可在护理页发起预约，服务类型包括洗澡/洗护、美容、修甲和全套服务。')}
        </Text>

        <Text style={styles.subheading}>{L('Booking Methods', '预约方式')}</Text>
        <InfoCard
          title={L('Manual Booking', '手动预约')}
          description={L('Select your dog, service, date, time slot, and optionally add your contact info and notes.', '选择狗狗、服务、日期和时段，并可选填写联系方式与备注。')}
          icon="calendar-outline"
          color="#3B82F6"
        />
        <InfoCard
          title={L('Voice / Quick Book', '语音/快速预约')}
          description={L(
            'Say or type something like "Groom for Buddy Friday at 2pm" and the form fills automatically.',
            '可直接说或输入类似“周五下午2点给 Buddy 做美容”，表单会自动填写。',
          )}
          icon="mic"
          color="#7C3AED"
        />
      </HelpSection>

      {/* FAQ */}
      <HelpSection title={t('help.faq')} icon="chatbubble-ellipses">
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>{L('How accurate is the breed detection?', '品种识别准确率有多高？')}</Text>
          <Text style={styles.faqAnswer}>
            {L(
              'Our AI model has approximately 84% accuracy on purebred dogs. Mixed breeds will show multiple breed possibilities.',
              '对纯种犬识别准确率约为 84%。混种犬会展示多个可能品种。',
            )}
          </Text>
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>{L('What does "double coat" mean?', '“双层毛”是什么意思？')}</Text>
          <Text style={styles.faqAnswer}>
            {L(
              'A double coat has two layers: longer outer guard hairs for protection, and a dense, fluffy undercoat for insulation. These dogs need thorough drying to prevent skin issues.',
              '双层毛包含外层护毛和内层底毛，需更充分吹干以降低皮肤问题风险。',
            )}
          </Text>
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>{L('How often should I wash my dog?', '狗狗多久洗一次比较合适？')}</Text>
          <Text style={styles.faqAnswer}>
            {L(
              'Most dogs: every 4-6 weeks. Active/outdoor dogs: every 2-4 weeks. Over-washing can strip natural oils from the coat.',
              '多数狗狗建议 4-6 周一次；运动量大或户外活动多可 2-4 周一次。过度清洗会带走天然油脂。',
            )}
          </Text>
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>{L('Can puppies use the machine?', '幼犬可以使用洗护设备吗？')}</Text>
          <Text style={styles.faqAnswer}>
            {L(
              'Yes! Use the "Puppy First Wash" cycle for dogs under 6 months. It\'s gentler and helps them get comfortable with the experience.',
              '可以。6 个月以下幼犬建议使用“幼犬首次洗护”方案，更温和、适应性更好。',
            )}
          </Text>
        </View>
      </HelpSection>

      {/* Glossary */}
      <HelpSection title={t('help.glossary')} icon="book">
        <TableRow label={L('AKC Group', 'AKC 分组')} value={L('Breed classification by American Kennel Club', '美国养犬俱乐部的品种分组')} />
        <TableRow label={L('Coat Blowing', '换毛季')} value={L('Seasonal heavy shedding of undercoat', '季节性大量脱落底毛')} highlight />
        <TableRow label={L('Guard Hairs', '护毛')} value={L('Longer, coarser outer coat hairs', '较长、较粗的外层毛发')} />
        <TableRow label={L('Hot Spots', '湿疹热斑')} value={L('Painful skin infections from moisture', '由潮湿引发的疼痛性皮肤炎症')} highlight />
        <TableRow label={L('Matting', '打结')} value={L('Tangled, clumped fur', '毛发缠结成团')} />
        <TableRow label={L('Undercoat', '底毛')} value={L('Dense, soft layer beneath outer coat', '外层毛下方致密柔软的内层毛')} highlight />
      </HelpSection>

      {/* Footer */}
      <View style={styles.footer}>

          <Text style={styles.versionText}>
          {L('Version', '版本')}: App v{APP_VERSION} · API v{apiVersion}{(effectiveBuildDate !== 'unknown' || effectiveBuildSha !== 'unknown') ? ` · ${L('Build', '构建')} ${effectiveBuildDate} (${effectiveBuildSha})` : ''}
        </Text>
        <Text style={styles.footerText}>
          {t('help.footer')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  versionText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sectionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  paragraph: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
    marginBottom: 16,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    marginTop: 8,
  },
  stepsContainer: {
    gap: 16,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  infoCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  infoCardDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 10,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 19,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableRowHighlight: {
    backgroundColor: '#F9FAFB',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  tableLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  tableValue: {
    fontSize: 14,
    color: '#6B7280',
  },
  tipsList: {
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#374151',
  },
  tipBoxText: {
    fontSize: 14,
    color: '#374151',
    flexShrink: 1,
  },
  faqItem: {
    marginBottom: 16,
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
