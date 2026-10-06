# Upload, timestamp ба алдааны оношилгоо

## Тогтоосон асуудал

2026-09-30-ны baseline туршилтаар зөв 80 KB болон 32 MiB видео шууд Express API, Next.js rewrite хоёр замд HTTP 201 буцсан. Backend-ийг зогсооход Next.js rewrite нь ECONNREFUSED-ийг JSON бус HTTP 500 болгосон. Энэ нь давтагдах бодит алдаа; өмнөх хэрэглэгчийн 500-ийн request ID, тухайн үеийн лог байгаагүй учир яг ижил шалтгаан байсан гэж дүгнээгүй. [Baseline](upload-baseline.json).

Мөн эх A/V timestamp-ийг 0-ээс 20 ms-ээс их зөрөхөд `inspect()` шууд буцааж байсан. Энэ шалгалт зөв файлуудыг татгалзаж байв. Одоо эх файлыг хадгалж, шаардлагатай үед job-ийн prepare шатанд `source-timeline.mp4` үүсгэнэ. Видео timeline 0-оос эхэлж, аудионы **харьцангуй** зөрүү хадгалагдана: хожуу аудионы өмнө чимээгүй хэсэг нэмнэ; видеоны өмнөх аудиог тайрна. Хоёр track-ийг тус тусад нь 0 болгож синхрон алдагдуулахгүй. STT, preview, subtitle render ижил timeline ашиглана.

## Хэрэгжүүлэлт

- Next route handler request/response-ийг stream-ээр дамжуулна. Бүтэн video `arrayBuffer()`, `formData()` эсвэл RAM clone ашиглахгүй. Express upload disk дээр backpressure-тай бичигдэнэ.
- Нэг файл 200 MiB; хуучин video + M&E upload-д хоёр файл зөвшөөрдөг тул multipart нийт хязгаар 401 MiB. Browser, backend-ийн файл тус бүрийн хязгаар ижил. Chunked upload-д ч хязгаар үйлчилнэ.
- API бүх алдаанд `{error:{code,message,requestId}}` буцаана. Validation 400/422, хэмжээ 413, давхардал/worker busy 409, backend/FFmpeg/storage unavailable 503. Proxy timeout 504. HTML/хоосон upstream хариу нь frontend дээр анхны HTTP status-тай харагдана.
- JSON лог: requestId, jobId, stage, durationMs, HTTP/provider status, process exit code. Header, түлхүүр, provider response, transcript, error stack логт орохгүй.
- Upload бүрт тогтвортой `Idempotency-Key`; SQLite reservation давхар хүсэлтэд ижил job буцаах эсвэл 409 хүлээлгэх төлөв өгнө. Давхар action нь ажиллаж буй job-ийг дахин эхлүүлэхгүй.
- Cancellation нь upload stream, FFmpeg болон provider fetch-ийг зогсооно. FFmpeg бүрэн хаагдсаны дараа түр файлыг цэвэрлэнэ. Дууссан шатны cache хадгалагдана.
- `runActive` restart-ийн үед үе шат хооронд тасарсан ажлыг ч илрүүлнэ. Төлөв `SERVER_RESTARTED` болж, студиэс үргэлжлүүлж болно.
- Төлбөртэй provider хүсэлт явуулахын өмнө durable `.pending` marker үүсгэнэ. Хариу бүрэн хадгалагдаагүй бол автоматаар давтахгүй. Provider хэрэглээг шалгаад студийн тусгай checkbox болон баталгаажуулалтаар давтаж болно. Бэлэн raw хариу/аудиог дахин ашиглана. Provider талын exactly-once төлбөрийг батлах боломжгүй.

Студи бодит дамжсан byte progress, cancel, эх хэлний сонголт, Монгол зорилтот хэл, Live/Demo төлөвтэй. Гар ажиллагаатай алхмууд эвхэгддэг. Засвар алдаанд хэвээр үлдэж, өөр ажил/анги руу шилжих болон архивлах/нийтлэл буулгах үйлдэл баталгаажуулалттай. Ажлын жагсаалт огноо, төлөв, алдаа/request ID, үргэлжлүүлэх/цуцлах үйлдэлтэй. Player ачаалах/хүлээх төлөвтэй; үзсэн ангиуд серверийн progress-оос харагдана.

## Баталгаажуулалт

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run smoke
node scripts/upload-diagnostics.mjs
npm.cmd run test:browser
npm.cmd run build
npm.cmd start
```

- Unit тест: хожуу/эрт аудио, нийтлэг 5 секундийн эхлэл; normalize хийсний дараах бодит PCM аудионы чимээгүй/дуутай хэсэг; process cancellation; ambiguous paid retry/cache; HTML/хоосон/хуучин/шинэ error response.
- [Upload шалгалтын тайлан](upload-verification.json): зөв жижиг/32 MiB, эвдэрсэн/буруу төрөл, 201 MiB болон chunked upload, backend down, idempotency, concurrent upload, цуцлалт/цэвэрлэгээ, timestamp → demo preview, HTTP Range, worker busy, cancel/resume, restart recovery, FFprobe дутуу тохиргоо, request ID-тай лог.
- Browser тест тусгаарласан demo өгөгдөл ашиглана: 360/390/768/1280/1440 px; keyboard/Escape, contrast, reduced motion; upload progress, 503 алдааны дараах файл хадгалалт/retry, автомат хадмал, хүний хяналт/preview/нийтлэх, 5-р үнэгүйгээс 6-р төлбөртэй анги. Зураг: `docs/screenshots/`.
- Төсөлд lint script тохируулаагүй. Шинэ lint dependency нэмээгүй.
- Энэ засварын шалгалтад **төлбөртэй live API дуудаагүй**. Өмнөх богино live шалгалт тусдаа `data/live-check/report.json`-д бий.

Локал production: http://localhost:3000. Dubbing код хадгалсан, студид идэвхгүй; автомат урсгал TTS дуудахгүй. Нэг API процесс / нэг worker ашиглана. Гадаад домэйн, HTTPS deployment, CDN, олон worker queue, банкны автомат gateway/webhook нь тусдаа тохиргоо шаардлагатай хэвээр.
