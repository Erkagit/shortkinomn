# shortkinomn — streaming platform

Одоогийн автомат хадмалын production урсгал, шинэ UI болон шалгалтын тайлан: [SHORTKINOMN.mn.md](SHORTKINOMN.mn.md). Локал production асаах: `npm run build` → `npm start`.

Public бүтээгдэхүүн нь Монгол хэл дээрх богино цуврал кино. AI орчуулга, хадмал засвар,
дуу оруулалт нь зөвхөн `/admin/translation` дахь дотоод production workflow.

## 1. Одоогийн architecture / audit

Эхний хувилбар нэг Next.js client хуудас, Express 5 API, JSON job store,
FFmpeg/ffprobe болон demo/live translation providers-той байсан. Prisma, SQL database,
auth, role, payment, movie/episode catalog байгаагүй. `/api/jobs`, файлууд,
voice clone болон health endpoint-ууд нэвтрэлт шаардахгүй байсан.

Нэмсэн бүтэц:

```text
Next.js public UI ── same-origin /api ── Express API
Next.js admin layout ── server-side session check
                                    ├── SQLite metadata + migrations
                                    ├── Private media storage adapter
                                    ├── Payment provider adapter (manual)
                                    └── Existing JSON jobs + FFmpeg workflow
```

Node.js 24 ашиглана. Шинэ runtime dependency нэмээгүй; SQLite нь `node:sqlite`.
Metadata нь `data/platform.sqlite`; бичлэгийн файлууд `data/media`, эх/ажлын файлууд
`data/jobs` дотор байна. SQL migration API эхлэх үед transaction-аар нэг удаа ажиллана.
Хуучин JSON jobs устахгүй. Кинотой холбоогүй хуучин ажлыг автоматаар public болгож нийтлэхгүй.

## 2. Reuse

- Existing transcript/translation editor, context, glossary, speaker voices, review flags.
- Upload validation + ffprobe media inspection, 200 MB / 2–180 секундийн хязгаар.
- Demo/live providers, progress polling, job recovery, revision conflict detection.
- FFmpeg extraction, audio fit/mix, dubbing render болон unit tests.
- FFmpeg 7+ дээр file filtergraph-д `-/filter_complex`, хуучин хувилбарт legacy flag.

## 3. Remove / refactor

- Public landing-ээс upload, translation, demo/live status, settings, job history салгасан.
- Studio-г `/admin/translation` руу шилжүүлсэн; хуучин workflow хадгалагдана.
- `/api/jobs`, `/api/voices`, `/api/health` одоо ADMIN session шаарддаг.
- Studio upload нь урьдчилан үүсгэсэн episode ID шаарддаг.
- Test fixture контент production database-д seed хийхгүй.
- Нийтлэхдээ immutable media snapshot үүсгэнэ: дараагийн засвар published видеог устгахгүй.

## 4. Database

`apps/api/migrations/001-platform.sql`:

- `users`, `sessions`: USER/ADMIN, salted scrypt password, hashed session tokens.
- `movies`, `episodes`: Монгол нэр, эх нэр, URL metadata, release status, flags, price,
  нийт ангийн тоо, episode number, `is_free`, private storage keys.
- `categories`, `genres`, `movie_categories`, `movie_genres`: олон-олон холбоос.
- `purchases`, `payments`: movie-level unlock, server price snapshot, status,
  unique transaction ID, баталгаажуулсан админ.
- `watch_progress`, `favorites`: хэрэглэгчээр тусгаарласан persistent мэдээлэл.
- `subtitles`, `processing_jobs`: хэл/хадмал storage metadata, episode–existing job холбоос.
- `schema_migrations`: migration түүх.

Анги default: `episode_number <= 5`. Админ анги бүрийн `is_free`-г өөрчилж болно.
Кино устгах үйлдэл archive; анги устгах үйлдэл unpublish. Худалдан авалт болон түүх
хадгалагдана. Subscription/coin checkout оруулаагүй; entitlement шалгалт нэг service-д
төвлөрсөн тул шинэ эрхийн model дараа нэмэх боломжтой.

## 5. Public UI

```text
/                      Featured + trending + new + database categories + continue
/movies                24-item pagination + category filters
/movies/[slug]         Metadata, favorite, resume, free/locked episode list
/watch/[episodeId]     Video, Монгол VTT, resume, previous/next, 5-second autoplay
/category/[slug]       Category catalog
/search                300ms debounce, Монгол/эх нэр/category/genre search
/login, /register      Email/password + safe return URL
/library               Continue, purchased, watched, favorites
/profile               Account + logout
/payments?movie=[id]   Invoice creation, instructions, status, history
```

Dark/crimson tokens, sticky navigation, mobile menu, horizontal carousels,
loading skeletons, empty/error/retry states, toast, reduced-motion support.
Public homepage SSR data, movie metadata/OpenGraph, private pages noindex.
Үзсэн хугацаа 10 секунд тутам, pause/end/navigation үед хадгалагдана.
Native player нь play/pause, volume, seek, fullscreen, VTT toggle дэмжинэ.
Vertical video `object-fit: contain` ашиглан viewport-д бүтнээр багтана.

## 6. Admin UI

```text
/admin                 Totals + revenue
/admin/movies          Catalog management
/admin/movies/new      Create movie
/admin/movies/[id]     Edit, archive, add/edit/unpublish episodes
/admin/episodes        Episode inventory
/admin/translation     Episode selection + existing studio + review/publish
/admin/categories      Categories and genres
/admin/payments        Manual receipt verification
/admin/users           Account inventory
/admin/settings        Server configuration status
```

Server layout session шалгана; API бүр тусад нь role шалгадаг. Public navigation
дотор admin link байхгүй. Settings нь нууц биш серверийн тохиргоог харуулдаг;
credential-уудыг browser-оор засварлахгүй.

## 7. Ажиллуулах / implementation plan

Database/API → public UI → auth/progress → CMS → pipeline integration → purchase/media
authorization → responsive/error/SEO гэсэн үе шатаар нэмсэн.

1. `npm.cmd install` (dependencies өмнө суусан бол алгасаж болно).
2. `apps/api/.env.example`-ийн шинэ хувьсагчуудыг existing `.env`-дээ нэмнэ.
3. `ADMIN_EMAIL`, 10+ тэмдэгттэй unique `ADMIN_PASSWORD` тохируулна. Анхны startup дээр
   энэ email байхгүй бол ADMIN үүсгэнэ. Existing хэрэглэгчийг автоматаар promote хийхгүй.
4. `FFMPEG_PATH`, `FFPROBE_PATH` нь executable-ийн зөв зам байх ёстой.
5. `npm.cmd run dev`, дараа `/login` → `/admin`.
6. Category → movie → episode → upload → prepare → transcript review → translate →
   translation review → subtitle render эсвэл dubbing render → preview → approve → publish.
7. Admin publish нь episode media/subtitles болон movie-ийн `PUBLISHED` төлөвийг нэг transaction-д
   хадгална. Нийтлэгдсэн movie public catalog/detail, episode watch болон stream route-д шууд гарна.

Өөр API хаяг хэрэглэвэл web талд `API_INTERNAL_URL`-г build болон runtime хоёуланд өгнө.
`DATA_DIR`, `DATABASE_PATH`-аар хадгалах замыг өөрчилж болно.
Өгөгдөл, `.env`, build output gitignore-д орсон.

### Төлбөр

`PAYMENT_INSTRUCTIONS` хоосон үед checkout хаалттай. Утга өгвөл хэрэглэгч pending
invoice үүсгээд зааврын дагуу төлнө. Админ банкны орлогын **дүн, MNT валют, хүсэлт**-ийг
бодитоор шалгаж, давтагдашгүй банкны гүйлгээний дугаараар баталгаажуулна.
`PAID` payment болон purchase нэг transaction-д өөрчлөгдөнө. Давтан checkout/verify
эрхийг давхар үүсгэхгүй. Хэрэглэгч client body-оос amount, user ID, paid status өгч эрх
авах боломжгүй.

QPay болон бусад gateway холбогоогүй. `PaymentProvider` extension point дээр тухайн
provider-ийн invoice болон webhook verification-ийг нэмэх хэрэгтэй. Автомат adapter
нь signature, merchant, invoice, amount, currency, replay/idempotency-г сервер дээр
баталгаажуулсны дараа entitlement олгох ёстой.

### Шалгалтууд

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run smoke
node scripts/browser-smoke.mjs
```

- Core tests: transcript grouping, timeline/SRT, translation response validation,
  FFmpeg audio fit болон full render.
- Isolated smoke: auth/role, draft visibility, search, MIME validation, subtitle/dub,
  review/publish, snapshot isolation, media Range, premium video/VTT denial, checkout,
  admin payment verification, cross-user denial, cross-session progress, favorites,
  logout, archive.
- Chromium smoke: 360/390/768/1280/1440, navigation, actual login form, admin guard,
  movie form, translation studio, player lock/free playback, overflow/runtime errors.
  Тестүүдийн database/content/browser profile түр хавтаст үүсээд устдаг.
  `docs/screenshots` дахь кинонууд зөвхөн тест fixture; бодит public catalog биш.
- Browser script нь Chrome-ийн default Windows зам эсвэл `CHROME_PATH` ашигладаг.
  API 4020, web 3011, CDP 9229 порт сул байх шаардлагатай; үндсэн dev серверийг зогсоохгүй.
- Core/smoke runner Windows WinGet FFmpeg суулгалтыг test-д зориулан олж чадна.
  App runtime-д executable PATH/.env тохиргоо тусдаа шаардлагатай.

### Production deployment-ийн үлдсэн бодит холболтууд

Энэ нь ажилладаг single-instance streaming MVP. Production deployment хийсэн гэж
үзэхгүй: бодит gateway, объект хадгалалт/CDN, domain/HTTPS, ажиллагааны хяналт болон
бодит контентын setup эндээс гадна үлдэнэ.

#### Vercel-ийн хязгаарлалт

Одоогийн API-г Vercel Function болгон шууд байршуулж болохгүй. Express API нь
нэг удаан ажиллах Node.js процесс, `node:sqlite` database, JSON job state,
`data/jobs`/`data/media` доторх байнгын файл, 200 MB хүртэлх upload, мөн FFmpeg/
FFprobe child process шаарддаг. Vercel-ийн function filesystem нь байнгын storage биш;
function instance бүр тусдаа тул SQLite болон worker-ийн state-ийг хуваалцахгүй.
Том multipart upload болон урт медиа боловсруулалтыг web function proxy-гоор дамжуулах
нь timeout/request-ийн хязгаартай, production-д найдвартай биш.

Иймээс Vercel-д одоогоор зөвхөн `apps/web`-ийг байршуулж болно; харин public SSR,
login, studio, upload, subtitle болон playback нь API-с хамаарах тул тэдгээрийг
ажиллуулсан гэж тооцохгүй. Web build/runtime-д `API_INTERNAL_URL`-г хүрч болох
API endpoint руу, API дээр `WEB_ORIGIN`-г `https://shortkino.mn` руу тохируулах
шаардлагатай. Одоогийн API `127.0.0.1` дээр listen хийдэг бөгөөд тусдаа host дээр
шууд хүрэхээр тохируулаагүй.

Бүрэн production ашиглалтаас өмнө API/FFmpeg-д зориулсан тогтвортой Node worker,
managed database, private object storage + entitlement шалгасан streaming/CDN,
том файлыг browser-оос storage руу шууд оруулах, processing queue хэрэгтэй.
Эдгээр нь production data/media/auth урсгалыг өөрчлөх архитектурын ажил тул энэ
аудитад сольж, туршилтгүйгээр production руу шилжүүлээгүй.

- SQLite + JSON worker нь нэг API instance-д зориулсан. Олон instance бол PostgreSQL,
  shared queue, distributed rate limiter/locks, worker recovery хэрэгтэй.
- `MediaStorage`-г object storage adapter-аар сольж, зөвшөөрөл шалгасны дараа богино
  хугацаатай signed delivery хэрэгжүүлнэ. Private bucket-ийг public болгож болохгүй.
- Одоогийн local storage нь protected HTTP Range delivery; HLS/DASH/DRM биш.
- Богино синтетик клипээр live ElevenLabs STT + OpenAI орчуулга + автомат хадмалын production API шалгалт тэнцсэн. TTS түр ашиглахгүй. Бодит киноны хадмалын чанарыг админ хянана.
- `NODE_ENV=production`, `WEB_ORIGIN=https://...`, HTTPS reverse proxy, persistent disk,
  database/media backups, monitoring, resource limits тохируулна. API-г дотоод сүлжээнд
  байлгаж Next.js-ээр дамжуулна. Upload request limit дор хаяж 200 MB шаардлагатай.
- Password reset, email verification, MFA, автомат refund/reconciliation, batch upload UI
  ороогүй. Endpoint/core schema нь episode бүрд job холбож batch orchestration нэмэх боломжтой.
- Production горимд demo боловсруулалтын үр дүн нийтлэхийг API хориглоно.
- Админ bootstrap password-ийг анхны account үүссэний дараа орчны config-оос арилгаж болно.
- Нийтлэх movie/poster/backdrop metadata болон лицензтэй видео контентыг админ оруулна.

FFmpeg compatibility source: https://ffmpeg.org/pipermail/ffmpeg-cvslog/2024-January/140522.html
