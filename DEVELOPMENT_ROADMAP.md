# UnforgettableRides 开发路线图

> 最后更新: 2026-04-04 (新增正式上线前 P0 清单：支付/公司验证邮箱/价格库存/电话服务/域名绑定)

---

## 2026-04-01 Email-only 账号安全增强（待开始）

### 范围决策
- 不做短信验证码（SMS OTP）与手机号验证流程。
- 本轮只做 Email 验证与 Email 一次性验证码（OTP）。

### 目标
- 降低盗号/撞库风险，同时尽量不影响首次注册转化。
- 对“新设备登录”做 step-up 验证，而不是每次登录都打断。

### Todo（Roadmap）
- [ ] 后端：新增 `email_verifications` 表（user_id、code_hash、expires_at、used_at、purpose）。
- [ ] 后端：新增 `trusted_devices` 表（user_id、device_fingerprint、last_seen_at、created_at）。
- [ ] 后端：新增接口 `POST /api/v1/auth/email/send-verification`（注册后发送验证邮件）。
- [ ] 后端：新增接口 `POST /api/v1/auth/email/verify`（校验邮箱验证码并标记 `email_verified_at`）。
- [ ] 后端：新增接口 `POST /api/v1/auth/login/challenge`（新设备触发 email code）。
- [ ] 后端：新增接口 `POST /api/v1/auth/login/verify-device`（验证 code 后签发 token 并写入 trusted device）。
- [ ] 后端：登录策略升级：已验证设备正常登录；新设备需 email code；高风险登录可强制 challenge。
- [ ] 后端：关键操作 gate（需已验证邮箱）：结账支付、最终保存预约、敏感账号操作（改密/删号）。
- [ ] 后端：邮件发送限流（按 IP + 邮箱 + purpose），防止刷验证码。
- [ ] 后端：补齐 API 测试（成功/过期/错误码/重复使用/限流/新旧设备分支）。
- [ ] App：注册后显示“请验证邮箱”状态页 + 可重发入口（倒计时）。
- [ ] App：新设备登录时增加 `Enter Email Code` 页面（6 位码输入、重发、错误提示）。
- [ ] App：guest -> sign-in 转换流程接入邮箱验证状态提示（不强制打断浏览，关键动作再 gate）。
- [ ] Web Dashboard（如有 C 端登录入口）：同步实现新设备 challenge 流程。
- [ ] 文档：更新 `docs/USER_GUIDE.md` 与 `docs/api/api-specification.md` 的认证章节与错误码。

### UX 规则（本轮确定）
- 注册：允许先完成注册并进入应用，但账号标记为“未验证邮箱”。
- 未验证邮箱用户：可浏览/体验；遇到关键动作时提示先完成邮箱验证。
- 新设备登录：触发邮箱验证码确认；已信任设备不重复验证。

### 验收标准
- 新用户从注册到验证邮箱流程可闭环，失败路径（过期码/错误码/重发）可恢复。
- 同账号在新浏览器/新设备登录时必然触发 email challenge。
- 关键动作在未验证邮箱状态下被正确拦截并给出清晰引导。

---

## 2026-03-24 Vision Analytics: 门线可视化配置（已完成）

### 已完成
- [x] Dashboard `Vision Analytics` 增加门线配置工具（Camera Setup 区域）：
  - 追踪开关（Tracking Enabled）
  - 入店方向选择（`negative_to_positive_is_entry` / `positive_to_negative_is_entry`）
  - 门线坐标输入（`x1,y1,x2,y2`）
  - 预览画面双击两点绘制门线（可清除、可覆盖）
- [x] 预览叠加门线可视化（SVG overlay），坐标映射到推理分辨率。
- [x] `camera/start` 支持运行时追踪参数，不再仅依赖容器环境变量：
  - `tracking_enabled`
  - `door_line_coords`
  - `door_line_direction`
- [x] `camera/status` 返回追踪配置与推理分辨率（用于前端回显）：
  - `tracking_enabled`
  - `door_line_coords`
  - `door_line_direction`
  - `frame_width`
  - `frame_height`
- [x] 新增运行时配置接口：`POST /api/v1/ml/camera/config`
  - 支持在摄像头运行中应用追踪配置（无需重启 worker）
- [x] Dashboard 增加 `Show Test Overlay`
  - 在预览中显示实时检测框与质心，仅用于校准门线，不写统计。
- [x] 追踪配置持久化（按门店）：
  - `GET/PUT /api/v1/analytics/tracking-config`
  - Dashboard 打开时自动加载，应用时自动保存。
- [x] Dashboard 支持配置快照复制/导入：
  - `Copy Config Snapshot`
  - `Import Config Snapshot`
- [x] Dashboard 支持配置快照文件导入/导出：
  - `Download Snapshot JSON`
  - `Import JSON File`

### 说明
- 门线配置在“下一次点击 Start Camera”时生效。
- 坐标系基于推理尺寸（默认 `640x480`），不是原始摄像头尺寸。

---

## 2026-03-24 Vision Analytics 追踪计数（主流程已完成）

### 目标
- 将当前“按帧检测 + 平滑推断进出”的统计方式升级为“追踪事件驱动”。
- 减少同一只狗在连续帧中被重复统计的问题。
- 在不增加 API 压力的前提下，提升进/出店统计准确性。

### 核心方案
- 采集/检测与上报解耦：
  - 内部检测循环按更高频率运行（默认目标 5 FPS，CPU 友好）；
  - 对 API 保持低频上报（默认每 2 秒），避免额外写入压力。
- 追踪计划：
  - Phase 1 先完成追踪事件数据通路（schema + ingest + summary shadow counters）；
  - Phase 2 引入 ByteTrack + 线段穿越判定（line crossing）；
  - 继续保留 legacy 指标，dashboard 并行显示 tracked 与 legacy 结果。

### 分阶段交付（当前）
- [x] 触发帧批量选择/删除（dashboard + API）
- [x] `dog_track_events` 表与写入通路（含 `session_id`）
- [x] `/analytics/summary` 返回 shadow counters：
  - `tracked_entries`
  - `tracked_exits`
  - `tracking_active`
- [x] camera worker 采集与上报节奏解耦（高频检测、低频上报）
- [x] 引入门线穿越事件生成（支持 ByteTrack，保留自定义 tracker fallback）
- [x] 升级为 ByteTrack（Hungarian + 更稳健遮挡恢复）
- [x] Dashboard 增加 tracked/legacy 切换展示
- [x] `/analytics/summary` 增加 tracked vs legacy 差异字段（便于实测对比）
- [x] 门店级 `metrics_default` 持久化（tracked/legacy 默认展示模式）
- [x] 门店级 `flow_gap_threshold_pct` 持久化（readiness 与 field-test 阈值统一）

### 配置方向（新增环境变量）
- `CAMERA_TRACK_FPS`（默认 `5`）
- `CAMERA_REPORT_INTERVAL_SEC`（默认 `2`）
- `DOOR_LINE_COORDS`（例如 `100,120,520,280`）
- `DOOR_LINE_DIRECTION`（例如 `left_to_right_is_entry`）
- `TRACK_ACTIVATION_THRESHOLD`（ByteTrack 激活阈值，默认 `0.25`）
- `TRACK_MIN_MATCHING_THRESHOLD`（ByteTrack 匹配阈值，默认 `0.8`）
- `TRACK_LOST_TRACK_BUFFER`（ByteTrack 丢失缓冲帧数，默认 `30`）
- `TRACK_STATE_TTL_SEC`（穿越判定状态缓存 TTL，默认 `8`）

### 验收标准（阶段性）
- API 不增加调用频率（维持约每 2 秒上报）；
- summary 可同时提供 legacy 与 tracked 指标；
- tracked 计数在实测视频中明显降低重复计数；
- 回滚路径清晰（关闭 tracking 后仍可使用 legacy 指标）。

### 剩余收尾（待实测）
- [ ] 真实门店摄像头长时回放/在线实测（验证遮挡与高峰时段稳定性）
- [ ] 对比 tracked vs legacy 的日汇总偏差，确定默认展示策略

### 当前实现说明（2026-03-24）
- 已落地门线穿越事件（line crossing）与方向判定：
  - 使用 `DOOR_LINE_COORDS` + `DOOR_LINE_DIRECTION`；
  - 通过点到线两侧符号变化判定穿越；
  - 增加穿越冷却时间避免线附近抖动重复触发。
- 当前默认优先使用 ByteTrack（supervision）进行 ID 关联与遮挡恢复；
- 当运行环境缺少 ByteTrack 依赖时自动回退到轻量自定义 tracker，保持功能可用；
- API 合约不变，dashboard 可继续并行展示 tracked 与 legacy 指标。

---

## 2026-03-23 Vision Analytics 视频上传分析

### 已完成
- Dashboard `Vision Analytics` 新增“上传视频分析”入口（与实时摄像头流并行可用）：
  - 支持上传本地狗狗视频后进行抽帧检测；
  - 返回视频统计结果：时长、分析帧数、单帧最大狗数、狗出现占比、Top 帧时间点。
- API 新增视频分析代理接口（admin/store_manager）：
  - `POST /api/v1/ml/video/analyze`
  - 将上传视频转发给 ML 服务处理，并统一错误返回结构。
- ML 服务新增视频分析端点：
  - `POST /video/analyze`
  - 基于 YOLO 对抽样帧检测，输出聚合指标用于门店复盘。
- Dashboard 文案已完成中英文双语（视频上传、分析状态、结果字段）。
- 新增触发帧留存与回看：
  - API 新增 `analytics_trigger_frames` 表，按时间仅保留最近 100 张；
  - 触发来源覆盖：摄像头进出事件、上传视频分析 Top 帧；
  - Dashboard `Vision Analytics` 新增“最近触发帧”面板，可直接回看抓拍图与来源信息。

### 说明
- 该功能用于“回放/离线复盘”场景，不替代实时摄像头统计；
- 可在无实时流条件下快速验证门店犬只检测能力。

---

## 2026-03-19 密码重置流程（生产逻辑）

### 已完成
- 后端新增密码重置能力：
  - `POST /api/v1/auth/password/forgot`（公开）：提交邮箱后统一返回成功文案，避免账号枚举。
  - `POST /api/v1/auth/password/reset`（公开）：基于 token 重置密码。
  - 新增 `password_reset_tokens` 表（token hash、过期时间、单次使用）。
- 安全策略：
  - token 采用 hash 存储；
  - token 过期/已使用即失效；
  - 重置成功后清理同用户其他 token。
- Dashboard 登录体验：
  - 登录页新增 `Forgot password?` 入口；
  - 新增 `/forgot-password` 页面；
  - 新增 `/reset-password?token=...` 页面。
- 文档已更新：
  - [docs/ADMIN_DASHBOARD_HELP.md](docs/ADMIN_DASHBOARD_HELP.md) 增加密码重置章节与部署变量说明。
- API 测试补充：
  - 覆盖 forgot 泛化响应；
  - 覆盖 reset token 成功重置密码。

### 部署配置补充
- `EMAIL_NOTIFICATION_WEBHOOK_URL`
- `PASSWORD_RESET_BASE_URL`
- `PASSWORD_RESET_TOKEN_EXPIRES_MIN`（默认 30）

---

## 2026-03-19 Dashboard 门店管理与分配 UI

### 已完成
- 后端新增门店管理接口（admin）：
  - `POST /api/v1/stores`：创建门店；
  - `PUT /api/v1/stores/:id`：更新门店；
  - `DELETE /api/v1/stores/:id`：停用门店（软删除，保护最后一个 active store）。
- Dashboard 新增 `Stores` 页面（admin）：
  - 支持列表、搜索、创建、编辑、启用/停用门店。
- Dashboard `Members` 页面升级：
  - 新建/编辑 `store_manager` 与 `staff` 时可直接勾选 `Assigned Stores`；
  - 提交后自动调用 `/users/:id/stores` 同步分配关系。
- API 客户端新增 user-store 分配方法：
  - `GET /users/:id/stores`
  - `PUT /users/:id/stores`
- Dashboard 帮助文档更新：
  - [docs/ADMIN_DASHBOARD_HELP.md](docs/ADMIN_DASHBOARD_HELP.md)
  - 新增门店管理和人员门店分配操作指南。

### 下一步
- Members 列表增加“已分配门店数/名称”列，减少来回点击编辑查看分配关系。
- 增补门店管理与分配的 API 集成测试（重复 slug、最后门店停用保护、多门店用户切换）。

---

## 2026-03-19 Profile & Multi-store Scope

### 已完成
- App 个人资料页已支持头像上传（复用裁剪流程）、头像删除（恢复默认图标）、手机号与通知偏好（邮件/短信）设置。
- App Web 顶部会员入口图标已支持显示用户头像（无头像时回退默认图标）。
- 后端已完成 Phase 3 的 `store_id` 基线隔离：
  - `appointments`：列表/详情/创建/更新/取消/收费按门店范围控制；
  - `orders`：列表/详情/状态更新按门店范围控制，创建时写入 `store_id`；
  - `products`：列表/详情/创建/更新/下架/图片上传按门店范围控制，创建时写入 `store_id`；
  - `appointment-charges`：列表/退款按关联预约门店范围控制。
- `analytics` 已支持门店维度：检测写入携带 `store_id`，`current/entries/summary/hourly` 查询支持按门店过滤。
- 设置系统已升级为“全局 + 门店覆盖”：新增 store_settings_by_store，/settings 对 manager 按所属门店读写，admin 可按 store_id 查询/更新。
- Dashboard 已新增 admin 门店切换器（侧栏下拉），并通过前端 API 层全局注入 store_id，联动 Overview/Orders/Appointments/Products/Analytics/Settings。
- 多门店权限模型（设计目标）已明确并按此实施：
  - `admin`：可查看全部门店数据，并可在 dashboard 中切换门店视角；
  - `store_manager`：可访问分配给他的门店（支持一人多门店）；
  - `staff`：可访问分配给他的门店（默认可先保持单门店绑定）；
  - 当前系统状态：仍是单 `store_id` 绑定，需要后续升级到 `user_store_links` 才能支持 manager 多门店。
- 兼容旧数据：对历史 store_id IS NULL 记录保留过渡可见性，避免单店存量数据回归。
- API 测试通过：rides-api 74/74。

### 下一步
- 实现 `user_store_links`（用户-门店多对多）并将 manager 切换器限制为“仅已分配门店”。
- 为 manager/staff 增加“当前门店”只读标识（无需切换，便于操作确认）。
- 补充 Phase 3 集成测试：admin 跨店视图、manager/staff 强制本店、历史 NULL 数据兼容。

---

## 2026-03-18 Dashboard IA Update（管理后台信息架构）

### 已完成
- Web Dashboard 侧边栏按分组重构为：`Operations`、`Members`、`Analysis`、`Configuration`。
- 导航重命名：`Camera Analytics` -> `Vision Analytics`（中英文同步）。
- `Business Membership Applications` 不再作为独立导航页，审核流程并入 `Business Members` 页面面板。
- `Business Members` 导航新增待审核提醒徽标（显示 pending 数量）。
- 兼容旧路由：`/business-membership-applications` 自动重定向到 `/business-memberships`。
- 帮助文档新增：[docs/ADMIN_DASHBOARD_HELP.md](docs/ADMIN_DASHBOARD_HELP.md)。

---

## 2026-03-17 Production Deployment & Customer Portal

### 已完成

**Track C — 生产部署基础设施:**
- `rides-api/Dockerfile` — 多阶段构建，Node 20 Alpine，非 root 用户，health check。
- `rides-admin/Dockerfile` — 多阶段构建（repo root context），Vite build + nginx SPA fallback + API 反向代理。
- `docker-compose.yml` — CPU-only 部署（API + Web Dashboard + ML Service），命名卷持久化数据。
- `docker-compose.production.yml` — GPU 生产部署变体。
- `.env.production` — 完整环境变量模板，涵盖 JWT、HMAC、Admin bootstrap、ML、AI Advisor、Camera 等全部配置。
- `scripts/backup.sh` — SQLite 安全备份（`.backup` 命令）+ JSON 数据备份 + 自动轮替 + Docker 卷备份 + 还原模式。
- `ecosystem.config.js` — PM2 进程管理配置（单实例 fork 模式，适配 SQLite 单写）。
- `.dockerignore` — rides-api 和 rides-admin 均已添加。

**Track A — 多门店最小基础铺垫:**
- 新增 `stores` 表（id, name, slug, address, phone, email, timezone, is_active, settings_json）。
- 现有表迁移：appointments、orders、products 新增 `store_id` 列（nullable，不影响现有逻辑）。
- 68 个集成测试通过，零行为变更。

**Track B — 顾客 Web 端 (rides-portal):**
- Scaffold：Vite + React 18 + TypeScript + React Router + React Query + Axios（端口 5174）。
- 共享类型：复用 `@shared/types` 别名。
- AuthContext：登入/注册/登出，localStorage token 管理，auto-logout on 401。
- CartContext：加购/删除/改数量/清空，自动计算合计。
- 商品浏览：分类筛选 + 搜索 + 商品卡片 + 加入购物车（ProductsPage + ProductDetailPage）。
- 预约服务：日期选择 → 可用时段 → 填写资讯 → 提交预约（BookingPage）。
- 购物车 + 结帐：数量调整 + 订单送出 + 成功页（CartPage）。
- 我的订单：订单列表 + 状态标签（OrdersPage）。
- 登入/注册：双模式表单，顾客固定 `customer` 角色（LoginPage）。
- 完整 CSS：响应式设计，navbar + product grid + booking form + cart layout。
- TypeScript 零错误，Vite production build 通过。

---

## 2026-03-17 Pre-launch Security Hardening

### 已完成
- API：新增 Jest + supertest 测试基础设施（60 个集成测试）。
- API：Auth 集成测试覆盖：公开路由访问、JWT 认证网关、角色访问矩阵（admin/manager/staff/customer）、数据所有权隔离、内部服务鉴权、密码修改、最后管理员保护。
- API：修复 dog/care/wash 数据所有权 — 顾客只能查看/修改自己的狗狗、洗护记录、护理事件；staff 可查看所有。
- API：修复狗狗创建时硬编码 `user_id: 'user-1'` 的问题 — 现在使用 `req.user.id`。
- API：防止通过 `req.body` 覆盖保护字段（`id`、`user_id`、`created_at`）。
- API：内部服务鉴权升级为 HMAC-SHA256 签名请求（含时间戳防重放），同时保留旧版 X-Internal-Key 兼容。
- ML camera_worker：已更新为发送 HMAC 签名 header（`X-Internal-Signature` + `X-Internal-Timestamp`）。
- API：导出 `app` 和 `db` 供测试使用（`require.main === module` 保护启动逻辑）。

---

## 2026-03-16 Profile 与 RBAC 更新

### 已完成
- 移动端 App：新增 Profile 页面（查看账户、修改密码、退出登录）。
- 移动端 App：Header 中使用 Profile 按钮替代独立 logout 按钮。
- Web Dashboard（RBAC）：对 staff 隐藏 Camera Analytics 与 Settings（仅 admin/store_manager 可见）。
- Web Dashboard：已增加路由保护，staff 通过 URL 访问 `/analytics` 或 `/settings` 时会重定向到 overview。
- 后端 RBAC：Analytics API 仅允许 `admin/store_manager` 访问（已移除 staff）。
- 后端：新增最后管理员保护（last-admin lockout protection），禁止停用或降级最后一个 active admin。
- Web Dashboard：新增仅 admin 可见的 User Management 页面（创建、编辑、启用/停用 staff 账号）。
- Web Dashboard：`Users` 导航与 `/users` 路由仅对 admin 可见。
- Web Dashboard：增强 Overview 页面，新增待处理订单、今日营收、最近订单面板与状态徽标。
- Web Dashboard：Overview 分析卡片仅对 manager+ 角色展示（staff 仅显示订单/预约相关信息）。
- Web Dashboard：Appointments 页面为 `confirmed` 预约新增 `No Show` 操作。
- 移动端 API：新增 `changePassword` 方法。
- API：新增 `trust proxy` 支持，用于反向代理场景下正确获取 client IP（env 配置、数值解析、安全默认值）。修复 `TRUST_PROXY=false` 被当作子网规则、`TRUST_PROXY=1` 被当作字符串等边界问题。
- 后端：新增 `store_settings` 表（key-value 模式），支持门店名称、电话、地址、营业时间、预约配置等持久化存储。
- 后端：预约可用时段计算现在使用数据库中的门店设置（替代此前的环境变量配置）。
- Web Dashboard：Settings 页面改造为从数据库加载/保存门店设置，包含门店信息与预约参数两个面板。
- Web Dashboard：修复 Settings 页面摄像头 API 调用未携带认证 token 的问题。
- Web Dashboard：修复 Overview 页面时区问题 — SQLite `datetime('now')` 产生的 UTC 时间戳在浏览器端正确解析（兼容 Safari）。

---

## 2026-03-16 限流（Rate Limiting）

### 已完成
- API 新增内存版 sliding-window 限流器。
- 登录接口：每个 IP 在 15 分钟窗口内最多 10 次尝试。
- 注册接口：每个 IP 在 15 分钟窗口内最多 5 次尝试。
- 触发限流时返回 HTTP 429，并附带 `Retry-After` header 与友好提示。
- 过期限流记录每 10 分钟自动清理。

---

## 2026-03-16 认证与安全更新

### 已完成
- API 已补齐用户认证基础能力（users 表、JWT auth、login/signup/register/me/change-password）。
- Web Dashboard 已接入认证流程（login 页面、auth context、受保护路由、sidebar 用户信息、logout）。
- 移动端已搭建认证流程骨架（auth context、login/register 页面、app 级 auth gate）。
- 已增加生产环境安全检查：
  - 生产环境必须配置 `JWT_SECRET`。
  - 生产环境初始化 admin bootstrap 需要 env 配置。
- 已加强 C 端/B 端数据边界控制：
  - Orders：顾客只能读取自己的订单。
  - Appointments：顾客只能读取/更新/取消自己的预约。
  - Staff 角色保留门店运营所需权限。
- 为 ML camera worker 增加内部回调鉴权：
  - `camera_worker` 发送 `X-Internal-Key`。
  - API 将 internal key 权限严格收敛到 `POST /api/v1/analytics/detection` 单一路由。
- 犬种分析策略已更新：LLM vision 优先，ViT 兜底，Mock 为最后退路。

### 说明
- 当前数据模型已在 orders 与 appointments 中加入 `user_id` 关联，并包含现有 SQLite 数据库迁移。
- 本次更新已消除此前识别的风险：internal service key 可绕过 `/api/v1/*` 路由。

### 下一步建议
1. ~~增加自动化 auth/authorization 集成测试（customer/staff/admin 访问矩阵）。~~（已于 2026-03-17 完成，60 个测试）
2. ~~将内部回调鉴权升级为签名请求或短期 service JWT。~~（已于 2026-03-17 完成，HMAC-SHA256 签名）
3. ~~为 `/api/v1/auth/login` 增加限流与暴力破解防护。~~（已于 2026-03-16 完成）
4. 继续推进 Phase 3 的多门店支持（`store_id`）：补齐 analytics 与设置项的按门店隔离。

---

## 项目概览

UnforgettableRides 是一个宠物护理零售店管理平台,包含:

### 前端(3个入口)

| 入口 | 技术栈 | 用户 | 说明 |
|------|--------|------|------|
| **移动端 App** | React Native / Expo | C端顾客 | 浏览产品、下单、预约、狗狗管理、洗护推荐、AI顾问 |
| **Web 顾客端** | Vite + React + TS | C端顾客 | App 的浏览器版本,顾客不装 App 也能浏览产品、下单、预约 |
| **Web 管理后台** | Vite + React + TS | B端店员/管理员 | 运营中台:摄像头客流、商品管理、订单管理、预约管理、门店设置 |

> **注意**:Web 顾客端和 Web 管理后台是**两个不同的应用**,面向不同用户群体。

> 当前 `rides-admin` 是管理后台,Web 顾客端待建设。

### 后端
- **API 服务**(Express.js + SQLite)— 核心业务逻辑,同时服务 App、Web C端、Web B端
- **ML 服务**(FastAPI + YOLOv8 + ViT)— 犬种识别、店内检测

---

## 已完成功能 ✅

### 核心功能(v1.0 — 2026年3月完成)

| 模块 | 功能 | 移动端App | Web顾客端 | Web管理后台 |
|------|------|-----------|-----------|-------------|
| 犬种识别 | 拍照识别犬种和毛发类型 | ✅ | — | — |
| 狗狗档案 | 添加/管理狗狗信息 | ✅ | — | ✅(只读) |
| 洗护推荐 | AI 根据犬种推荐洗护参数 | ✅ | — | — |
| QR 码 | 生成洗护参数二维码给洗狗机扫描 | ✅ | — | — |
| 洗护历史 | 查看历史洗护记录 | ✅ | — | — |
| 日常护理 | 每日护理任务、连续打卡、快速记录 | ✅ | — | — |
| AI 顾问 | 多模型宠物问答(OpenAI/Gemini/本地) | ✅ | — | — |
| 摄像头分析 | 店内犬只检测、进出统计 | — | — | ✅ |
| 预约系统 | 预约管理 + 自然语言快捷预约 | ✅ | — | ✅ |

### 零售功能(v1.1 — 2026年3月完成)

| 模块 | 功能 | 移动端App | Web顾客端 | Web管理后台 |
|------|------|-----------|-----------|-------------|
| 产品目录 | 浏览产品、分类筛选、搜索 | ✅ | — | ✅(增删改查) |
| 购物车 | 添加/修改数量/删除,本地持久化 | ✅ | — | — |
| 下单 | 填写信息、提交订单、库存校验 | ✅ | — | — |
| 订单管理 | 查看订单历史/状态 | ✅ | — | ✅(状态流转) |
| 首页商店入口 | 快捷操作卡片 | ✅ | — | — |

### AI 增强功能(v1.2 — 2026年3月完成)

| 模块 | 功能 | 移动端App | Web顾客端 | Web管理后台 |
|------|------|-----------|-----------|-------------|
| 语音预约 | 麦克风录音 → Whisper 转录 → LLM 解析 → 自动填表 | ✅ | — | — |
| 文字快捷预约 | 自然语言输入 → LLM/正则解析 → 自动填表 | ✅ | — | — |
| 多 LLM 支持 | Claude / ChatGPT / Gemini 自动降级 | ✅ | — | — |
| AI 设置 | 用户自带 API Key(本地存储、每次请求发送) | ✅ | — | — |
| 首选 AI 选择 | 用户选择偏好 AI 提供商(Auto/OpenAI/Claude/Gemini) | ✅ | — | — |
| 混合犬种分析（Hybrid breed analysis） | LLM vision 优先（multi-provider 自动降级）-> ViT（ML）兜底 -> Mock 最后退路 | ✅ | — | — |
| 浏览器导航 | Web 端浏览器前进/后退支持(React Navigation Linking) | ✅ | — | — |
| 响应式布局 | 移动端 App Web 版按钮/底栏宽度限制 | ✅ | — | — |

> **Web 顾客端已完成 MVP** — `rides-portal` 已上线商品浏览、预约、购物车结帐、订单查询功能（2026-03-17）。

---

## 开发路线图

### 第一阶段:用户认证系统 🔐

> 优先级:**最高** — 开店前必须完成

> 预计工作量:中等

**目标**:让 Web 后台有登录保护,不同用户有不同权限

#### 1.1 数据库 — 新增 users 表

```sql

CREATE TABLE users (

  id TEXT PRIMARY KEY,

  email TEXT UNIQUE NOT NULL,

  password_hash TEXT NOT NULL,

  name TEXT NOT NULL,

  role TEXT NOT NULL DEFAULT 'staff',

    -- 角色:admin(超级管理员)、store_manager(店长)、staff(店员)

  store_id TEXT,              -- 所属门店(admin 为空表示可访问所有门店)

  is_active INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now')),

  updated_at TEXT DEFAULT (datetime('now'))

);

```

#### 1.2 API — 认证接口

```

POST /api/v1/auth/register   — 创建用户(仅 admin)

POST /api/v1/auth/login      — 登录,返回 JWT token

GET  /api/v1/auth/me          — 获取当前用户信息

PUT  /api/v1/auth/password    — 修改密码

```

#### 1.3 API — 认证中间件

```javascript

// authMiddleware — 验证 JWT,注入 req.user

// roleGuard('admin') — 仅允许指定角色访问

// roleGuard('admin', 'store_manager') — 允许多角色

```

#### 1.4 Web 前端
- 登录页面(email + 密码)
- axios 请求拦截器自动附加 Authorization header
- 路由守卫:未登录跳转登录页
- 侧边栏显示用户名和角色

#### 1.5 涉及文件

| 文件 | 改动 |
|------|------|
| `rides-api/src/index.js` | 新增 users 表、auth 路由、中间件 |
| `shared/types.ts` | 新增 User、LoginRequest、LoginResponse 类型 |
| `rides-admin/src/services/api.ts` | 新增 authAPI、axios 拦截器 |
| `rides-admin/src/pages/LoginPage.tsx` | **新建** |
| `rides-admin/src/App.tsx` | 添加登录路由、路由守卫 |
| `rides-admin/src/contexts/AuthContext.tsx` | **新建** — 认证状态管理 |

---

### 第二阶段:角色权限控制 🛡️

> 优先级:**高** — 与第一阶段同步或紧接其后

> 预计工作量:中等

**目标**:admin 能看所有数据和管理用户,store_manager 只能管理自己门店

#### 2.1 权限矩阵

| 功能 | admin | store_manager | staff |
|------|-------|---------------|-------|
| 查看所有门店数据 | ✅ | ❌ | ❌ |
| 管理用户 | ✅ | ❌ | ❌ |
| 管理门店设置 | ✅ | 本店 ✅ | ❌ |
| 管理产品/服务(全局模板) | ✅ | ❌ | ❌ |
| 管理本店产品库存/定价 | ✅ | ✅ | ❌ |
| 管理本店服务配置 | ✅ | ✅ | ❌ |
| 管理本店会员 | ✅ | ✅ | ✅(查看) |
| 调整会员积分 | ✅ | ✅ | ❌ |
| 管理订单 | ✅ | 本店 ✅ | 本店 ✅ |
| 管理预约 | ✅ | 本店 ✅ | 本店 ✅ |
| 查看分析报表 | ✅(跨店汇总) | 本店 ✅ | ❌ |

#### 2.2 Web 前端
- 根据角色动态显示/隐藏侧边栏菜单
- admin 额外菜单:用户管理页面
- 数据查询自动过滤(store_manager 只能看本店数据)

#### 2.3 涉及文件

| 文件 | 改动 |
|------|------|
| `rides-api/src/index.js` | 所有路由加 roleGuard 中间件 |
| `rides-admin/src/pages/UsersPage.tsx` | **新建** — admin 用户管理 |
| `rides-admin/src/App.tsx` | 侧边栏按角色渲染 |
| `rides-admin/src/contexts/AuthContext.tsx` | 暴露用户角色信息 |

---

### 第三阶段:多门店支持 🏪

> 优先级:**中** — 开第二家店之前完成

> 预计工作量:大

**目标**:支持多个门店,每个门店有独立的产品、服务、会员数据

#### 3.1 门店管理三大支柱

```

门店管理

├── 📦 产品管理 — 实物商品(洗护用品、零食、配件等)

├── 🛎️ 服务管理 — 门店提供的服务(洗澡、美容、锻炼、寄养等)

└── 👤 会员管理 — 顾客会员、积分、等级

```

每个门店可以独立管理这三类内容:
- 不同门店可以卖不同的产品、有不同的库存和定价
- 不同门店可以提供不同的服务项目、不同的价格和时间
- 会员归属门店,但积分可跨店使用(可选)

#### 3.2 数据库 — 新增 stores 表

```sql

CREATE TABLE stores (

  id TEXT PRIMARY KEY,

  name TEXT NOT NULL,             -- 门店名称,如 "UnforgettableRides 奥斯汀店"

  code TEXT UNIQUE NOT NULL,      -- 门店编号,如 "ATX-001"

  address TEXT,

  city TEXT NOT NULL,

  state TEXT NOT NULL,            -- 州/省

  country TEXT DEFAULT 'US',

  phone TEXT,

  email TEXT,

  timezone TEXT DEFAULT 'America/Chicago',

  business_hours TEXT,            -- JSON: {"mon":"9:00-18:00", ...}

  is_active INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now')),

  updated_at TEXT DEFAULT (datetime('now'))

);

```

#### 3.3 数据库 — 现有表添加 store_id

```sql

ALTER TABLE orders ADD COLUMN store_id TEXT REFERENCES stores(id);

ALTER TABLE appointments ADD COLUMN store_id TEXT REFERENCES stores(id);

ALTER TABLE dog_entries ADD COLUMN store_id TEXT REFERENCES stores(id);

ALTER TABLE dog_detections ADD COLUMN store_id TEXT REFERENCES stores(id);

```

#### 3.4 API — 门店管理接口

```

GET    /api/v1/stores           — 列出所有门店(admin)

POST   /api/v1/stores           — 创建门店(admin)

PUT    /api/v1/stores/:id       — 更新门店信息

DELETE /api/v1/stores/:id       — 停用门店

```

#### 3.5 API — storeScope 中间件

```javascript

// 自动注入 store_id 过滤条件

// admin:可传 ?store_id=xxx 或查看所有

// store_manager/staff:自动限定为 req.user.store_id

```

#### 3.6 涉及文件

| 文件 | 改动 |
|------|------|
| `rides-api/src/index.js` | stores 表、store CRUD、storeScope 中间件、所有查询加 store_id |
| `shared/types.ts` | 新增 Store 类型 |
| `rides-admin/src/pages/StoresPage.tsx` | **新建** — admin 门店管理 |
| `rides-admin/src/App.tsx` | 新增门店管理路由 |
| `rides-admin/src/components/StoreSelector.tsx` | **新建** — admin 切换门店视角 |

---

### 第四阶段:门店产品管理(支柱一)📦

> 优先级:**中** — 与第三阶段同步

> 预计工作量:中等

**目标**:产品模板全局统一,库存和价格各门店独立

#### 4.1 数据库 — 新增 store_products 表

```sql

CREATE TABLE store_products (

  id TEXT PRIMARY KEY,

  store_id TEXT NOT NULL REFERENCES stores(id),

  product_id TEXT NOT NULL REFERENCES products(id),

  stock_quantity INTEGER NOT NULL DEFAULT 0,

  price_override REAL,           -- NULL 表示使用全局基础价格

  is_available INTEGER DEFAULT 1, -- 该门店是否上架此产品

  UNIQUE(store_id, product_id)

);

```

#### 4.2 产品架构变化

```

之前:products.stock_quantity = 全局库存

之后:products 表 → 全局模板(名称、描述、类别、基础价格、图片)

      store_products 表 → 各门店的库存、门店价格、是否上架

```

#### 4.3 API 变化

```

GET /api/v1/products        — 返回当前门店的产品(含门店库存/价格)

POST /api/v1/orders         — 扣减当前门店的库存(store_products)

GET /api/v1/inventory       — 门店库存管理(新增)

PUT /api/v1/inventory/:id   — 更新门店库存/定价

```

#### 4.4 涉及文件

| 文件 | 改动 |
|------|------|
| `rides-api/src/index.js` | store_products 表、库存逻辑改为门店级别 |
| `shared/types.ts` | 新增 StoreProduct 类型 |
| `rides-admin/src/pages/InventoryPage.tsx` | **新建** — 门店库存管理 |
| `rides-admin/src/pages/ProductsPage.tsx` | 改为全局产品模板管理(admin) |
| `rides-app/src/services/api.ts` | 产品请求带门店上下文 |
| `rides-app/src/screens/ProductListScreen.tsx` | 显示门店价格/库存 |

---

### 第五阶段:门店服务管理(支柱二)🛎️

> 优先级:**中** — 与第三阶段同步或紧接其后

> 预计工作量:中等

**目标**:每个门店可以配置自己提供的服务项目、价格、时长

#### 5.1 服务 vs 产品的区别

| 维度 | 产品(Product) | 服务(Service) |
|------|----------------|----------------|
| 性质 | 实物商品,有库存 | 无形服务,有时间段 |
| 交付方式 | 购买带走 | 预约到店完成 |
| 库存概念 | 库存数量 | 每日可预约数量/时间段 |
| 下单方式 | 加购物车 → 下单 | 预约 → 到店服务 |
| 举例 | 狗粮、玩具、项圈 | 洗澡、美容、锻炼、寄养、健康检查 |

#### 5.2 数据库 — 新增服务相关表

```sql

-- 全局服务模板(admin 管理)

CREATE TABLE services (

  id TEXT PRIMARY KEY,

  name TEXT NOT NULL,             -- 如 "标准洗澡"、"全身美容"、"狗狗锻炼"

  description TEXT,

  category TEXT NOT NULL,         -- wash, groom, exercise, boarding, health_check, other

  base_price REAL NOT NULL,

  base_duration_minutes INTEGER NOT NULL,  -- 默认服务时长

  icon TEXT,                      -- 前端图标名

  is_active INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now'))

);

-- 门店服务配置(每店独立)

CREATE TABLE store_services (

  id TEXT PRIMARY KEY,

  store_id TEXT NOT NULL REFERENCES stores(id),

  service_id TEXT NOT NULL REFERENCES services(id),

  price_override REAL,            -- NULL 表示使用全局价格

  duration_override INTEGER,      -- NULL 表示使用全局时长

  is_available INTEGER DEFAULT 1, -- 该门店是否提供此服务

  max_daily_bookings INTEGER,     -- 每日最大预约数(NULL=不限)

  UNIQUE(store_id, service_id)

);

```

#### 5.3 与现有预约系统的整合

```

当前:appointments.service_type = 'wash' | 'groom' | 'nail_trim' | 'full_service'(硬编码)

之后:appointments.service_id → 关联 services 表

      预约时从 store_services 获取该门店可用的服务列表

      预约价格 = store_services.price_override ?? services.base_price

```

#### 5.4 API

```

-- 全局服务模板(admin)

GET    /api/v1/services           — 列出所有服务模板

POST   /api/v1/services           — 创建服务模板

PUT    /api/v1/services/:id       — 更新服务模板

-- 门店服务配置

GET    /api/v1/store-services              — 当前门店可用服务列表

PUT    /api/v1/store-services/:service_id  — 更新门店服务配置(价格、时长、是否可用)

-- 预约(改造)

GET    /api/v1/appointments/availability   — 基于门店服务配置返回可用时段

POST   /api/v1/appointments               — 创建预约时关联 service_id + store_id

```

#### 5.5 前端改动

**Web 管理后台:**
- `ServicesPage.tsx` — 全局服务模板管理(admin)
- `StoreServicesPage.tsx` — 门店服务配置(店长:开启/关闭服务、调整价格时长)
- 预约管理页面显示服务详情

**移动端 App:**
- BookAppointmentScreen — 从硬编码服务改为从 API 获取门店可用服务
- 服务列表动态渲染(不同门店看到不同的服务)

#### 5.6 预置服务模板

```json

[

  { "name": "标准洗澡", "category": "wash", "base_price": 35, "base_duration_minutes": 45 },

  { "name": "深层清洁洗澡", "category": "wash", "base_price": 55, "base_duration_minutes": 60 },

  { "name": "基础美容", "category": "groom", "base_price": 50, "base_duration_minutes": 60 },

  { "name": "全身美容", "category": "groom", "base_price": 80, "base_duration_minutes": 90 },

  { "name": "指甲修剪", "category": "groom", "base_price": 15, "base_duration_minutes": 20 },

  { "name": "狗狗锻炼(30分钟)", "category": "exercise", "base_price": 25, "base_duration_minutes": 30 },

  { "name": "狗狗锻炼(60分钟)", "category": "exercise", "base_price": 40, "base_duration_minutes": 60 },

  { "name": "日间寄养", "category": "boarding", "base_price": 45, "base_duration_minutes": 480 },

  { "name": "健康检查", "category": "health_check", "base_price": 30, "base_duration_minutes": 30 },

  { "name": "牙齿清洁", "category": "groom", "base_price": 40, "base_duration_minutes": 45 }

]

```

---

### 第六阶段:会员管理系统(支柱三)👤

> 优先级:**中** — 开店运营后逐步建设

> 预计工作量:大

**目标**:门店级会员管理,积分系统,会员等级

#### 6.1 数据库

```sql

-- 会员表

CREATE TABLE members (

  id TEXT PRIMARY KEY,

  store_id TEXT NOT NULL REFERENCES stores(id),  -- 注册门店

  name TEXT NOT NULL,

  phone TEXT NOT NULL,

  email TEXT,

  dog_ids TEXT,                    -- JSON: 关联的狗狗 ID 列表

  tier TEXT DEFAULT 'basic',      -- basic, silver, gold, vip

  points INTEGER DEFAULT 0,       -- 当前积分

  total_spent REAL DEFAULT 0,     -- 累计消费金额

  visit_count INTEGER DEFAULT 0,  -- 到店次数

  notes TEXT,

  is_active INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now')),

  updated_at TEXT DEFAULT (datetime('now')),

  UNIQUE(store_id, phone)         -- 同一门店手机号唯一

);

-- 积分变动记录

CREATE TABLE points_transactions (

  id TEXT PRIMARY KEY,

  member_id TEXT NOT NULL REFERENCES members(id),

  store_id TEXT NOT NULL REFERENCES stores(id),

  type TEXT NOT NULL,              -- earn(获得)、redeem(兑换)、adjust(调整)、expire(过期)

  points INTEGER NOT NULL,         -- 正数=获得,负数=消费

  balance_after INTEGER NOT NULL,  -- 变动后余额

  source TEXT,                     -- order(购物)、service(服务)、checkin(签到)、manual(手动)

  reference_id TEXT,               -- 关联的订单/预约 ID

  description TEXT,

  created_at TEXT DEFAULT (datetime('now'))

);

-- 会员等级规则(每门店可自定义)

CREATE TABLE member_tiers (

  id TEXT PRIMARY KEY,

  store_id TEXT NOT NULL REFERENCES stores(id),

  tier TEXT NOT NULL,              -- basic, silver, gold, vip

  min_points INTEGER DEFAULT 0,    -- 升级所需累计积分

  min_spent REAL DEFAULT 0,        -- 升级所需累计消费

  points_multiplier REAL DEFAULT 1.0,  -- 积分倍率(gold=1.5倍)

  discount_percent REAL DEFAULT 0, -- 会员折扣

  description TEXT,

  UNIQUE(store_id, tier)

);

```

#### 6.2 积分规则

```

赚取积分:

├── 购买产品 → 每消费 $1 = 1 积分(基础)

├── 预约服务 → 每消费 $1 = 1 积分(基础)

├── 每日签到 → 5 积分

└── 高等级会员 → 积分倍率加成(Silver 1.2x, Gold 1.5x, VIP 2x)

消费积分:

├── 100 积分 = $1 抵扣

├── 兑换产品

└── 兑换服务折扣

会员等级:

├── Basic  — 默认,无门槛

├── Silver — 累计消费 $200 或 500 积分

├── Gold   — 累计消费 $500 或 1500 积分

└── VIP    — 累计消费 $1000 或 3000 积分

```

#### 6.3 API

```

-- 会员管理

GET    /api/v1/members               — 查询会员(支持手机号搜索)

POST   /api/v1/members               — 注册新会员

GET    /api/v1/members/:id            — 会员详情(含积分、等级、消费记录)

PUT    /api/v1/members/:id            — 更新会员信息

POST   /api/v1/members/:id/points     — 手动调整积分(店长权限)

-- 积分查询

GET    /api/v1/members/:id/transactions — 积分变动历史

-- 积分自动触发(集成到现有流程)

POST   /api/v1/orders    → 下单完成后自动给会员加积分

POST   /api/v1/appointments → 服务完成后自动给会员加积分

```

#### 6.4 前端改动

**Web 管理后台:**
- `MembersPage.tsx` — 会员列表、搜索、注册新会员
- `MemberDetailPage.tsx` — 会员详情、积分历史、手动调整积分
- `MemberTiersPage.tsx` — 会员等级规则配置(店长)
- 订单页面 — 下单时关联会员、显示积分

**移动端 App:**
- 顾客查看自己的会员卡、积分余额、等级
- 下单/预约时输入手机号关联会员
- 积分兑换页面

#### 6.5 跨店积分策略(待确定)

| 策略 | 说明 | 复杂度 |
|------|------|--------|
| **门店独立** | 积分只能在注册门店使用 | 低 |
| **跨店通用** | 所有门店共享积分池 | 中 |
| **跨店部分通用** | 赚取归本店,使用可跨店 | 高 |

建议先实现"门店独立",后续根据业务需要再扩展。

---

### 第七阶段:跨店报表与数据分析 📊

> 优先级:**低** — 多店运营后

> 预计工作量:中等

**目标**:admin 可以查看跨门店汇总数据

#### 7.1 功能
- 跨店销售报表(按门店、日期、产品类别)
- 跨店服务报表(按门店、服务类型、预约量)
- 跨店会员统计(新增会员、活跃会员、总积分发放)
- 跨店库存预警(低库存产品汇总)
- 跨店客流量对比

#### 7.2 涉及文件

| 文件 | 改动 |
|------|------|
| `rides-api/src/index.js` | 新增报表聚合 API |
| `rides-admin/src/pages/ReportsPage.tsx` | **新建** — 跨店报表 |
| `rides-admin/src/App.tsx` | 新增报表路由(仅 admin 可见) |

---

### 第八阶段:Web 顾客端(C端)🌐

> 优先级:**中** — 门店开业后持续建设

> 预计工作量:大

**目标**:让顾客不装 App 也能在浏览器上使用核心功能

#### 8.1 与管理后台的关系

```

当前项目结构:

├── rides-app/     — 移动端 App(C端)

├── rides-admin/     — Web 管理后台(B端)  ← 已有

└── rides-portal/  — Web 顾客端(C端)    ← 新建

```

Web 顾客端是**独立项目**,不和管理后台混在一起:
- 不同的用户群体(顾客 vs 店员)
- 不同的 UI 风格(商城风格 vs 管理后台风格)
- 不同的权限模型(顾客登录 vs 员工登录)
- 共享同一套 API 和 `shared/types`

#### 8.2 功能范围

| 功能 | 说明 |
|------|------|
| 首页 | 门店介绍、服务展示、促销信息 |
| 产品浏览 | 按门店浏览产品、分类筛选、搜索 |
| 购物车 + 下单 | 和 App 同样的购物流程 |
| 服务浏览 | 查看门店提供的服务和价格 |
| 在线预约 | 选服务 → 选日期时间 → 提交预约 |
| 订单/预约查询 | 输入手机号查询历史订单和预约状态 |
| 会员查询 | 输入手机号查看积分余额、等级 |
| 门店选择 | 多门店时选择最近的门店 |

#### 8.3 技术方案
- Vite + React + TypeScript(和管理后台相同技术栈)
- 移动端优先响应式设计(顾客多用手机浏览器访问)
- 复用 `shared/types` 和 API 接口
- 可部署为独立站点或子域名(如 `shop.unforgettablerides.com` vs `admin.unforgettablerides.com`)

---

### 第九阶段:移动端增强功能 📱

> 优先级:**低** — 按需添加

> 预计工作量:各功能独立

| 功能 | 说明 |
|------|------|
| 店内犬只检测 | 手机拍照检测犬只数量(复用 ML /detect) |
| 移动端分析 | 查看店内客流量统计 |
| 门店选择 | 顾客选择最近的门店浏览产品/服务 |
| 移动端登录 | 基础设施已完成 ✅（auth context、登录/注册页面）；顾客自助注册待定 |
| 会员自助 | 顾客查看积分、等级、兑换奖励 |

---

### 第十阶段：自研宠物状态评估模型（核心 IP）🧠

> 优先级：**中高** — 开店即开始采集数据，模型逐步迭代

> 预计工作量：持续性投入（数据采集轻量、模型训练分阶段）

**目标**：利用门店服务过程中积累的独有数据（照片 + 标注 + 结果），渐进式训练专属模型，形成竞争对手无法复制的技术壁垒

#### 为什么这是护城河

```
通用模型（任何人都能调用）  vs  自研模型（只有你有数据）

├── 通用视觉模型：识别犬种 → 竞争对手同样可以调用
└── 自研评估模型：基于本店数千次服务记录训练
    ├── 皮毛状态评分 → 需要你的标注数据
    ├── 服务推荐 → 需要你的服务结果数据
    └── 回访预测 → 需要你的客户行为数据

数据飞轮：每次服务 → 新标注 → 模型更准 → 推荐更好 → 回访率更高 → 更多数据
```

#### 阶段 1：数据采集基础设施（开店 → 第 3 个月）

仅采集、不训练。目标积累 200-500 条标注样本。

| 数据类型 | 采集方式 | 存储 |
|----------|----------|------|
| 服务前照片 | 店员用手机/平板拍摄 | `service_photos` 表 + 文件存储 |
| 皮毛状态评分 | 店员在 App/Web 端打分（1-5 级） | `condition_scores` 表 |
| 服务后照片 | 服务完成后拍摄 | 同上 |
| 服务记录关联 | 自动关联犬种、服务类型、耗材、时长 | 现有 appointments + washes 表 |
| 回访间隔 | 系统自动计算同一狗的两次到店时间差 | 后处理计算 |

```sql
-- 新增表
CREATE TABLE service_photos (
  id TEXT PRIMARY KEY,
  dog_id TEXT NOT NULL,
  appointment_id TEXT,
  photo_type TEXT NOT NULL,        -- 'before' | 'after'
  photo_url TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE condition_scores (
  id TEXT PRIMARY KEY,
  dog_id TEXT NOT NULL,
  appointment_id TEXT,
  scored_by TEXT NOT NULL,          -- 评分店员 user_id
  coat_cleanliness INTEGER,        -- 1-5
  coat_matting INTEGER,            -- 1-5（打结程度）
  skin_health INTEGER,             -- 1-5
  overall INTEGER,                 -- 1-5
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### 阶段 2：迁移学习微调（第 3-6 个月）

基于现有 ViT 视觉模型进行迁移学习。

| 任务 | 输入 | 输出 | 最低样本量 |
|------|------|------|-----------|
| 是否需要服务 | 照片 + 犬种 | 二分类（需要/健康） | ~200 |
| 皮毛状态评级 | 照片 | 5 级分类 | ~500 |

```
技术方案：
├── 冻结 ViT 底层 → 只训练分类头（避免小样本过拟合）
├── 数据增强（翻转、亮度、裁剪）扩充训练集
├── 定期批量重训（每月或每积累 100 条新标注）
└── A/B 对比：模型推荐 vs 店员判断，追踪准确率
```

#### 阶段 3：多任务模型（第 6-12 个月）

样本量达到 500+ 后，扩展模型能力：

| 任务 | 说明 | 商业价值 |
|------|------|----------|
| 皮毛状态细粒度评分 | 5 维度（清洁度、打结、光泽、皮肤、整体） | 精准推荐服务套餐 |
| 服务类型推荐 | 基于状态 + 犬种 + 季节推荐具体服务 | 提升客单价 |
| 回访间隔预测 | 预测下次建议到店时间 | 主动召回、提升复购 |
| 产品亲和度 | 推荐适合的洗护产品 | 交叉销售 |

#### 阶段 4：专属模型护城河（第 2 年+）

| 能力 | 说明 | 数据壁垒 |
|------|------|----------|
| 犬只再识别 | 通过外观识别回头客（无需查 ID） | 需要本店摄像头 + 到店数据 |
| 服务结果预测 | 预测服务时长、难度、耗材消耗 | 需要本店历史服务数据 |
| 跨门店知识迁移 | 新店用老店模型冷启动 | 需要多店统一数据格式 |
| 健康趋势分析 | 追踪单只狗的皮毛/皮肤变化趋势 | 需要长期纵向数据 |

#### 涉及文件（阶段 1）

| 文件 | 改动 |
|------|------|
| `rides-api/src/index.js` | 新增 `service_photos`、`condition_scores` 表 + CRUD API |
| `shared/types.ts` | 新增 `ServicePhoto`、`ConditionScore` 类型 |
| `rides-admin/src/pages/AppointmentsPage.tsx` | 服务详情中嵌入拍照 + 评分表单 |
| `rides-app/src/screens/` | 店员端拍照 + 评分 UI |
| `ml-models/training/` | **新建** — 数据导出 + 训练脚本（阶段 2 启用） |

#### 关键指标

| 指标 | 阶段 1 目标 | 阶段 2 目标 | 阶段 3 目标 |
|------|------------|------------|------------|
| 标注样本数 | 200+ | 500+ | 2000+ |
| 模型准确率（是否需要服务） | — | ≥80% | ≥90% |
| 推荐采纳率（店员接受模型建议） | — | ≥60% | ≥80% |
| 数据采集率（有标注的服务占比） | ≥50% | ≥70% | ≥85% |

---

## 技术决策记录

### 已确定

| 决策 | 选择 | 原因 |
|------|------|------|
| 认证方案 | JWT | 移动端和 Web 端统一,无状态 |
| 产品架构 | 全局模板 + 门店库存/定价 | 新店开业只需关联产品,不用重复录入 |
| 服务架构 | 全局模板 + 门店服务配置 | 统一服务定义,各店可调整价格/时长/是否提供 |
| 权限模型 | RBAC(基于角色) | 简单直接,三种角色足够当前需求 |
| 门店三大支柱 | 产品 + 服务 + 会员 | 全部按门店级别管理 |

### 待确定

| 决策 | 选项 | 何时决定 |
|------|------|---------|
| 数据库迁移 | SQLite → PostgreSQL | 开第二家店前评估 |
| 移动端登录 | 基础设施已完成（auth context、登录/注册页面、token 管理），是否开放顾客自助注册待定 | 根据业务需求 |
| 支付集成 | Stripe / Square | 确定支付流程后 |
| 跨店积分 | 门店独立 / 跨店通用 | 开第二家店时确定 |
| 会员与App账户 | 是否打通 | 移动端登录功能确定后 |

---

## 实施时间线

```

═══ 已完成 ═══════════════════════════════════════════════

2026年3月

  ├── v1.1 零售功能 ✅
  ├── v1.2 AI增强功能 ✅（语音预约、多LLM、混合犬种分析）
  ├── 第一阶段：用户认证 ✅（JWT、登录注册、auth中间件、限流）
  ├── 第二阶段：角色权限 ✅（RBAC、用户管理、路由保护、门店设置持久化）
  ├── Pre-launch 安全加固 ✅（HMAC签名、71个集成测试、所有权隔离）
  ├── 生产部署基础设施 ✅（Docker、.env模板、备份脚本、PM2）
  ├── 多门店基础铺垫 ✅（stores表、store_id列迁移）
  ├── Web 顾客端 MVP ✅（rides-portal：商品、预约、购物车、订单）
  └── Portal i18n 中英双语 🔄（codex 进行中）

═══ Soft Opening 冲刺（3/18 → 4/1）══════════════════════

  必须完成（P0 — 不上线就不能开门）:
  ├── 部署上线：API + Web 管理后台 + Portal 跑在生产环境
  ├── 真实数据录入：商品目录、门店设置、营业时间、staff 账号
  ├── 端到端冒烟测试：顾客注册→浏览→下单→预约完整流程
  └── 备份验证：跑一次完整备份+还原，确认数据可恢复

  正式上线前补充 P0（必须完成）:
  ├── [ ] 设置好支付账户（生产可用，含 webhook 与回调验收）
  ├── [ ] 设置公司验证邮箱（用于注册/登录验证；替换 demo 邮箱 `verify@unforgettablerides.com`）
  ├── [ ] 复核各门店会员收费与优惠价格（含生效时间/适用范围/叠加规则）
  ├── [ ] 上线真实商城产品、价格与库存（完成一次盘点与下单扣减回归）
  ├── [ ] 如启用电话预约：接入第三方电话服务 API 与生产账户（号码/配额/计费）
  └── [ ] 域名绑定与 HTTPS（替换 AWS IP 直连；用户端不暴露端口号）

  尽量完成（P1 — soft opening 有了更好）:
  ├── 摄像头对接：实际摄像头连通 ML 服务 + 管理后台展示客流
  └── 第十阶段·P1 数据采集：拍照+评分基础设施（开店即开始积累数据）

═══ Grand Opening 打磨（4/1 → 4/18）═══════════════════

  基于 soft opening 反馈迭代:
  ├── 修复运营中发现的 bug 和体验问题
  ├── 性能调优（如有瓶颈）
  ├── Portal/App 顾客端体验打磨
  └── 补全 P1 中未完成的项目

═══ 运营稳定期（4/18 → Q2-Q3）═════════════════════════

  ├── 第十阶段·P1：自研模型数据采集 🧠（持续积累标注样本）
  ├── 第三阶段：多门店支持 🏪（按需，开第二家店前完成）
  ├── 第四阶段：门店产品管理 📦
  ├── 第五阶段：门店服务管理 🛎️
  └── 第十阶段·P2：迁移学习微调 🧠（样本≥200后启动）

═══ 规模化阶段（Q3-Q4）════════════════════════════════

  ├── 第六阶段：会员管理系统 👤
  ├── 第七阶段：跨店报表 📊
  ├── 第八阶段：Web 顾客端增强 🌐
  ├── 第九阶段：移动端增强 📱
  └── 第十阶段·P3：多任务模型 🧠（状态评分+服务推荐+回访预测）

```

---

## 门店管理架构总览

```

门店 (Store)

├── 📦 产品管理

│   ├── products — 全局产品模板(admin 统一管理)

│   ├── store_products — 门店库存 & 门店定价

│   └── orders / order_items — 门店订单(自动扣门店库存)

│

├── 🛎️ 服务管理

│   ├── services — 全局服务模板(admin 统一管理)

│   ├── store_services — 门店服务配置(价格/时长/是否提供)

│   └── appointments — 门店预约(关联 service_id + store_id)

│

└── 👤 会员管理

    ├── members — 门店会员(姓名/手机/等级/积分)

    ├── points_transactions — 积分变动记录

    └── member_tiers — 门店会员等级规则

```

## 架构演进示意

```

当前(单店模式,认证已完成):

  App/Web → [JWT验证] → API → SQLite (users表,角色控制,门店设置)

第三~六阶段后:

  App/Web → [JWT验证] → API → SQLite/PostgreSQL

                                  ├── stores (门店)

                                  ├── users (用户,关联门店)

                                  ├── products (全局产品模板)

                                  ├── store_products (门店库存/定价)

                                  ├── services (全局服务模板)

                                  ├── store_services (门店服务配置)

                                  ├── members (门店会员)

                                  ├── points_transactions (积分记录)

                                  ├── member_tiers (会员等级规则)

                                  ├── orders (关联门店 + 会员)

                                  └── appointments (关联门店 + 服务 + 会员)

```

---

## 各阶段验收标准 (Definition of Done)

> 每个阶段交付前须满足以下四列全部 ✅，才视为"完成"。

### 第三阶段：多门店支持 🏪

| 层级 | 交付物 |
|------|--------|
| **Backend** | `stores` 表 + CRUD API；现有表加 `store_id`；`storeScope` 中间件；admin 可跨店查询 |
| **Web Dashboard** | 门店管理页面（admin）；`StoreSelector` 组件切换门店视角 |
| **App** | 顾客端门店选择（如有多店） |
| **Test** | admin 跨店查询 ✅；store_manager 仅看本店 ✅；staff 仅看本店 ✅；无 store_id 的旧数据兼容 ✅ |

### 第四阶段：门店产品管理 📦

| 层级 | 交付物 |
|------|--------|
| **Backend** | `store_products` 表；产品 API 返回门店库存/价格；下单扣门店库存 |
| **Web Dashboard** | 全局产品模板管理（admin）；门店库存管理页 |
| **App** | 产品列表显示门店价格/库存 |
| **Test** | 跨店库存独立 ✅；下单扣正确门店库存 ✅；缺货拦截 ✅ |

### 第五阶段：门店服务管理 🛎️

| 层级 | 交付物 |
|------|--------|
| **Backend** | `services` + `store_services` 表；预约关联 `service_id`；可用时段基于门店服务配置 |
| **Web Dashboard** | 全局服务模板管理（admin）；门店服务配置页 |
| **App** | 预约时动态加载门店可用服务列表 |
| **Test** | 门店关闭某服务后该服务不可预约 ✅；门店价格覆盖正确 ✅ |

### 第六阶段：会员管理 👤

| 层级 | 交付物 |
|------|--------|
| **Backend** | `members` + `points_transactions` + `member_tiers` 表；下单/完成服务自动积分 |
| **Web Dashboard** | 会员列表/详情/积分调整；会员等级规则配置 |
| **App** | 顾客查看会员卡/积分/等级 |
| **Test** | 积分正确计算 ✅；等级自动升级 ✅；手动调整有审计记录 ✅ |

---

## 数据模型演进计划

### Migration 策略

| 变更 | 阶段 | 策略 | 回滚方案 |
|------|------|------|----------|
| 现有表加 `store_id` | 第三阶段 | `ALTER TABLE ADD COLUMN`，默认值为初始门店 ID；代码兼容 `store_id = NULL` 过渡期 | 删除新列（SQLite 需重建表） |
| `products.stock_quantity` → `store_products` | 第四阶段 | 新增 `store_products` 表，迁移脚本复制现有库存到默认门店；过渡期同时读两处 | 回退到 `products.stock_quantity` |
| `appointments.service_type` → `service_id` | 第五阶段 | 新增 `service_id` 列，迁移脚本将硬编码类型映射到 `services` 表 ID；保留 `service_type` 作兼容 | 回退到 `service_type` 字段 |
| SQLite → PostgreSQL | 待定 | 导出/导入脚本；先在 staging 环境验证；API 层通过抽象层切换 | 保留 SQLite 文件作备份 |

### 兼容窗口

- 每次 schema 变更保留 **至少 1 个版本** 的向后兼容（旧字段可读）
- 迁移脚本包含 `up()` 和 `down()` 函数
- 变更前备份 SQLite 文件

---

## 风险与依赖

| 风险/依赖 | 影响 | 概率 | Fallback |
|-----------|------|------|----------|
| LLM API Key 额度用尽 | 犬种分析、语音预约、AI 顾问不可用 | 中 | 多 provider 自动降级已实现（Claude → OpenAI → Gemini → ViT → Mock） |
| ML 服务不可用 | 店内犬只检测停止 | 低 | 手动录入客流；摄像头分析为增值功能非核心 |
| 支付集成延迟 | 无法在线收款 | 中 | 先支持"到店付款"模式，线上仅记录订单 |
| SQLite 并发瓶颈 | 高峰时段写入锁等待 | 低（单店） | WAL 模式已启用；多店时迁移到 PostgreSQL |
| 部署环境变更 | API/Web 服务中断 | 低 | Docker 化部署；`.env` 管理敏感配置 |

---

## 发布节奏

| 项目 | 策略 |
|------|------|
| **Release cadence** | 双周发布（每两周一个可部署版本） |
| **分支模型** | `main` 为稳定分支；feature branch → PR → code review → merge |
| **灰度策略** | Staging 环境先验证 → 生产环境部署；单店阶段无需灰度 |
| **回滚策略** | Git revert + 重新部署；SQLite 文件备份恢复；API 版本前缀 `/api/v1` 确保向后兼容 |
| **安全检查** | 每个 PR：`node --check` + `tsc --noEmit`；每阶段完成后：手动安全 review |

---

## 2026-03-17 Admin-only Strategy Module (Moat / Growth Design)

### 已完成
- 在 `rides-admin` 新增 admin-only 页面：`/moat`
- 侧边栏 Strategy 导航仅 `admin` 可见
- `store_manager` 与 `staff` 无入口
- 路由权限已生效：非 admin 访问 `/moat` 自动重定向至 `Overview`
- 页面内容聚焦内部经营策略：
  - 增长飞轮
  - 经常性收入梯度方案
  - 90 天北极星指标

### 目标说明
- 目标是构建“长期护城河：运营数据 + 经常性收入”。
- 增长飞轮用于持续沉淀运营数据：周期计时、犬只处理模式、耗材用量与复访行为。
- 经常性收入梯度方案用于把服务转化为稳定现金流，提高可预测性与抗波动能力。
- 90 天北极星指标用于将策略落地到可追踪结果，保证执行节奏与复盘闭环。
- 随着装机与服务规模扩大，数据资产会持续增值，并反向强化运营与收入模型。

### 设计定位
- 仅管理层内部使用：门店运营、管理团队、投资沟通
- 非 2C 对外内容：不面向顾客展示经营策略与内部指标

### 涉及文件
- `rides-admin/src/pages/MoatStrategyPage.tsx`
- `rides-admin/src/App.tsx`
- `rides-admin/src/index.css`

---

## 2026-03-18 Business Membership (渠道会员) V1

### 目标
- 顾客身份保持不变：仍是普通顾客（Regular Customer）。
- 新增 Business Member（美容师/渠道带客方）角色。
- 建立“双轨机制”：
  - 顾客侧：可享受专属折扣（商品 + 服务）。
  - Business Member 侧：按规则累计积分与查看归因数据。

### 已实现范围（后端）
- 新增数据模型：
  - `business_memberships`
  - `customer_business_links`
  - `business_points_ledger`
  - `service_prices`
  - `appointment_charges`
- 订单结算支持 Business Membership：
  - 支持 `business_code`（可选）绑定
  - 自动计算折扣（百分比 + 单笔封顶 + 月度使用限制）
  - 记录 `subtotal` / `discount_amount` / `discount_reason` / `business_membership_id`
  - 自动发放积分（带客与自购使用不同倍率）
  - 订单取消时自动回滚积分
- 预约服务结算支持 Business Membership：
  - 新增 `POST /api/v1/appointments/:id/charge`
  - 使用 `service_prices` 基价 + 会员折扣计算
  - 写入 `appointment_charges` 并发放积分
- 新增业务会员接口：
  - 管理端：创建/更新/查询 Business Membership
  - 顾客端：邀请码解析与绑定
  - Business Member 端：查看我的会员资料、关联顾客、顾客预约/购物活动摘要、解绑、指标看板
  - 新增“申请入会流程”：
    - `POST /api/v1/business-memberships/apply`：顾客提交申请
    - `GET /api/v1/business-memberships/my-application`：顾客/业务会员查看自己的最新申请状态
    - `GET /api/v1/business-memberships/applications`：admin 查看待审核列表
    - `PUT /api/v1/business-memberships/applications/:id/review`：admin 审核（通过/拒绝）
    - 审核通过后自动执行：`customer` → `business_member` 角色升级 + 创建 `business_memberships` 档案

### 权限与边界
- `business_member` 作为独立角色加入用户体系。
- Business Member 仅可查看“自己关联顾客”的业务摘要，不开放全局订单/预约数据。
- “删除关联”采用“解绑”语义：解除关系，不删除历史订单/预约数据。
- 角色管控：
  - 仅 `customer` 可提交 Business Member 申请
  - 仅 `admin` 可审核申请
  - `store_manager` 与 `staff` 无审核入口

### 下一步（V1 UI）
- `rides-admin`：
  - [x] Business Member Application Review 页（admin）
  - [x] Business Membership 管理页（admin）
  - [x] Service Price 配置页（manager+）
  - [x] Appointment Charge 操作入口（staff+）
  - [x] Appointment Charge 记录页（staff+）
  - [x] Business Member Dashboard（business_member）：指标、关联顾客、顾客活动摘要、积分流水、解绑
- `rides-portal`：
  - [x] “成为 Business Member”申请页（customer）
  - [x] 顾客输入邀请码并绑定入口（Cart）
  - [x] 结算页展示折扣明细（下单成功卡片）

### 当前状态（2026-03-18）
- Business Membership 已形成 V1 闭环（后端结算 + 管理端 + 顾客端 + 业务会员端）。
- “顾客申请 → admin 审核 → 自动升级业务会员”流程已上线。
- 可按单店上线标准直接投入运营。

### 后续增强（非阻塞）
- Business Member Dashboard 趋势图（按日/周/月）。
- 新增页面的前端自动化测试补齐。

### 本轮新增（2026-03-18）
- [x] Appointment Charge 退款流程（`refunded`）及对应 UI。

---

## Services, Pricing, Memberships & Promotions

> Started: 2026-03-30 — Review after each step before proceeding.
> Can be implemented by Codex or Claude. Each step is self-contained and reviewable.

### Background
Each store configures its own service catalog, membership plans, and promotions.
Customers see prices in the booking flow and can browse deals and join membership plans in the app.

---

### Step 1 — Shared Types
**File:** `shared/types.ts`

Add the following TypeScript types (no DB, no UI yet):

```
StoreService {
  id, store_id, name, category, description?,
  base_price_cents, member_price_cents?,       // integer cents; null = free for members
  price_on_assessment: boolean,    // true = "price confirmed on site"
  size_variants?: { label, base_price_cents, member_price_cents? }[],  // e.g. XS/SM/MD/LG
  duration_minutes?,
  requires_prior_session: boolean, // e.g. treadmill needs prior training
  is_active: boolean,
  sort_order: number
}

MembershipPlan {
  id, store_id, name, description?,
  price_monthly, price_yearly?,
  included_categories: string[],   // services in these categories are free/discounted
  perks: string[],                 // free-text benefit lines shown on the card
  is_highlighted: boolean,         // shows "Most Popular" badge
  is_active: boolean,
  sort_order: number
}

UserMembership {
  id, user_id, store_id, plan_id, dog_id?,
  status: 'active' | 'cancelled' | 'expired',
  started_at, expires_at?
}

Promotion {
  id, store_id, title, description?,
  type: 'pct_off' | 'fixed_off' | 'free_service' | 'info',
  discount_percent?,               // for pct_off only (0-100)
  discount_value_cents?,           // for fixed_off only
  max_discount_cents?,             // optional cap for pct_off
  applies_to_service_ids?: string[], // empty = all services
  eligibility: 'all' | 'members_only' | 'new_customers',
  coupon_code?,                    // optional, null = no code needed
  is_stackable: boolean,           // can combine with membership/other promos
  priority: number,                // conflict resolver (higher applies first)
  usage_limit_total?,              // optional global redemption cap
  usage_limit_per_user?,           // optional per-user redemption cap
  valid_from, valid_until,
  is_active: boolean
}

UserCoupon {
  id, user_id, promotion_id, store_id,
  claimed_at, used_at?, expires_at?,
  status: 'available' | 'used' | 'expired'
}
```

**Review checkpoint:** Confirm types look correct before any DB or UI work.
Also confirm membership scope before Step 2:
- account-level membership (one plan per user), or
- dog-level membership (plan linked to one dog via `dog_id`).

---

### Step 2 — Database Tables
**File:** `rides-api/src/index.js`

Add SQLite table creation in the DB init block:

- `store_services` — columns from StoreService type above
- `store_membership_plans` — columns from MembershipPlan type
- `user_memberships` — columns from UserMembership type (`dog_id` nullable for account-level mode)
- `store_promotions` — columns from Promotion type
- `user_coupons` — columns from UserCoupon type

Important schema rule:
- Store currency values as integer cents only (`*_cents`); avoid float/dollar columns.

Seed one example store with:
- 3–4 sample services (wash, gym treadmill, grooming with size variants)
- 2–3 membership plans (one highlighted)
- 1–2 active promotions

**Review checkpoint:** Verify tables create cleanly and seed data is correct via API or SQLite browser.

---

### Step 3 — API Endpoints (Read)
**File:** `rides-api/src/index.js`

Public/customer read endpoints (auth required):

```
GET  /api/v1/stores/:id/services          → list active services for a store
GET  /api/v1/stores/:id/membership-plans  → list active plans for a store
GET  /api/v1/stores/:id/promotions        → list currently active promotions
GET  /api/v1/memberships/me               → user's active membership (store_id param optional)
GET  /api/v1/coupons/me                   → user's claimed coupons
```

**Review checkpoint:** Hit each endpoint with a REST client (or curl) and confirm responses match expected shape.

---

### Step 4 — API Endpoints (Write)
**File:** `rides-api/src/index.js`

```
POST /api/v1/memberships/join             → body: { plan_id, store_id }
                                            creates UserMembership, validates no duplicate active
POST /api/v1/memberships/:id/cancel       → cancel active membership
POST /api/v1/coupons/claim                → body: { promotion_id } or { coupon_code }
                                            validates eligibility + not already claimed
```

Admin/manager write endpoints:
```
POST   /api/v1/stores/:id/services        → create service
PUT    /api/v1/stores/:id/services/:sid   → update service
DELETE /api/v1/stores/:id/services/:sid   → deactivate (soft delete)

POST   /api/v1/stores/:id/membership-plans
PUT    /api/v1/stores/:id/membership-plans/:pid
DELETE /api/v1/stores/:id/membership-plans/:pid

POST   /api/v1/stores/:id/promotions
PUT    /api/v1/stores/:id/promotions/:pid
DELETE /api/v1/stores/:id/promotions/:pid
```

**Review checkpoint:** Test join, cancel, and coupon claim. Check duplicate + eligibility error cases.
Enforce store-scope on all write endpoints using existing role/store guards (admin all-store, manager scoped).

### Step 4.5 — API Tests (Pre-UI Gate)
**Files:** `rides-api/tests/*` (new/updated)

Add API tests immediately after Step 4:
- membership join/cancel happy path
- duplicate join rejection
- coupon claim eligibility + duplicate claim rejection
- promotion stacking/priority behavior
- store-scope authorization checks on all write endpoints
- pricing field validation (`*_cents`, percentage ranges)

**Review checkpoint:** API tests pass before proceeding to Step 5 (mobile UI).

---

### Step 5 — Booking Screen: Service Catalog + Price Summary
**File:** `rides-app/src/screens/BookAppointmentScreen.tsx`

Replace hardcoded service type buttons with dynamic list loaded from `GET /api/v1/stores/:id/services`.

After service is selected, show a pricing summary block:
```
  Self-Service Dog Wash (VIP Room)    ~30 min
  Base price:             $30.00
  Member discount:       −$30.00   ← shown only if user has active membership
  ────────────────────────────────
  You pay:                $0.00
```

For services with size variants: show a size picker (XS / SM / MD / LG) before the summary.
For `price_on_assessment: true` services: show "Final price confirmed on site" instead of a number.

Also update translations (EN + ZH) for any new UI strings.

**Review checkpoint:** Book a service as a non-member and as a member. Verify price summary is correct in both cases.

---

### Step 6 — Offers Screen (new screen)
**File:** `rides-app/src/screens/OffersScreen.tsx` (new)

Three sections:

**A. This Week's Deals**
- Promo cards from `GET /api/v1/stores/:id/promotions`
- Each card: title, valid dates, eligibility chip ("All customers" / "Members only" / "New customers"), discount label, CTA button (Book Now → navigate to booking, or Claim → POST /api/v1/coupons/claim)
- Empty state if no active promos

**B. Membership Plans**
- Plan cards from `GET /api/v1/stores/:id/membership-plans`
- Each card: name, monthly price, yearly price if available, included benefits list, perks list
- "Most Popular" badge on highlighted plan
- If user already has active membership: show "Active" badge + Cancel option
- If not: "Join — $X/month" button → calls POST /api/v1/memberships/join

**C. My Coupons**
- List from `GET /api/v1/coupons/me`
- Each item: promo title, coupon code (tap to copy), expiry, status chip
- Empty state if no coupons

Also add translations (EN + ZH) for all strings.

**Review checkpoint:** View all three sections. Join a plan. Claim a coupon. Verify state updates correctly.

---

### Step 7 — Navigation & Home Banner
**Files:**
- `rides-app/src/navigation/AppNavigator.tsx` — add Offers screen to Care tab stack
- `rides-app/src/screens/HomeScreen.tsx` — add promo banner if active promotions exist

Home banner logic: on mount, fetch active promotions for the user's preferred/last store. If any exist, show a dismissible banner card ("Deals available this week →") that navigates to Offers.

**Review checkpoint:** Verify Offers is reachable from Care tab and from the home banner.

---

### Step 8 — Web Dashboard: Store Configuration UI
**File:** `rides-admin` dashboard

Add store settings pages so managers can configure their own catalog:

- **Services** tab: table of services with edit/add/deactivate, size variant editor
- **Membership Plans** tab: plan cards editor with perk list management
- **Promotions** tab: create/edit/end promotions, coupon code field

These are admin/manager only (reuse existing role-gating patterns).

**Review checkpoint:** Create a service, a plan, and a promotion from the dashboard. Verify they appear in the mobile app.

---

### Step 9 — Polish & Edge Cases
- Handle stores with no services configured (show "Contact store for services")
- Handle expired memberships gracefully (show "Your membership expired on X")
- Handle promotions that have just expired (filter on server, fallback client check)
- Add loading skeletons and error states to OffersScreen
- Regression tests for new API endpoints

---

### Status
- [x] Step 1 — Shared types
- [x] Step 2 — Database tables + seed
- [x] Step 3 — Read API endpoints
- [x] Step 4 — Write API endpoints
- [x] Step 4.5 — API tests (pre-UI gate)
- [x] Step 5 — Booking screen: dynamic services + price summary
- [x] Step 6 — Offers screen
- [x] Step 7 — Navigation + home banner
- [x] Step 8 — Web dashboard configuration UI
- [x] Step 9 — Polish & edge cases

