# shortkinomn: дизайн ба автомат хадмал

Брэндийн wordmark, SVG icon/favicon, metadata, нийтийн header/footer, нэвтрэх хуудас, админ navigation шинэчлэгдсэн. Дотоод session cookie, ID, өгөгдөл болон API түлхүүрүүдийн нэрийг өөрчлөөгүй.

Нүүрний compact hero, poster catalogue, хайлт, киноны дэлгэрэнгүй, анги сонголт, player, эрх авах UI, админ хүснэгт/форм болон студи нэг token систем ашиглана (`apps/web/app/style.css`). Өнгө: `#0B0D12`, `#151922`, `#262C38`, `#F5F7FA`, `#9CA6B6`, `#F4B544`. Font нь Segoe UI / Noto Sans / Arial; Монгол кирилл Ө/Ү дэмжинэ. Mobile disclosure navigation, focus, keyboard Escape, reduced motion нэмэгдсэн.

Үнэгүй ангийн тоог нийтлэгдсэн `is_free` өгөгдлөөс бодно. Үзэлтийн тоо, рейтинг зохиогоогүй. “Редакцын сонголт” нь админы сонгосон кинонууд. Постергүй бол “Постер оруулаагүй” гэж ил тод харуулна. Screenshots дахь кинонууд тусгаарласан тест fixture бөгөөд бодит каталогт нэмэгдээгүй.

## Автомат хадмал

Видеог сонгоод нэг товч дарахад upload → ElevenLabs STT → OpenAI Монгол орчуулга → MP4 + SRT/VTT preview бэлтгэнэ. Эх дууг хадгална. Dubbing UI түр хаалттай, хэрэгжүүлэлт нь хадгалагдсан. `subtitle_auto` боловсруулалт хүний `transcriptReviewed` / `translationReviewed` баталгааг өөрөө үүсгэхгүй. Админ preview болон текстийг шалгаж хадгалсны дараа зөв ангид нийтэлнэ. Subtitle ажилд `/render` хүсэлт 409 буцаж, TTS ажиллахгүй.

Файл хэмжээ, төрөл, боломжтой үед уртыг browser шалгана; сервер FFprobe-оор дахин баталгаажуулна. Backend JSON биш хариу өгвөл HTTP төлөвтэй ойлгомжтой retry UI харуулна. Job жагсаалт бодит төлөв, алдаа, кино/ангийн холбоос болон бэлэн файлуудыг харуулна.

## Шалгалт

- `npm run typecheck`, `npm test`, `npm run build`.
- `npm run smoke`: auth/RBAC, draft visibility, upload, хадмал болон хадгалсан dubbing pipeline, review/publish, хуучин нийтлэгдсэн хувилбарыг хадгалах, төлбөрийн эрх, progress, favorites.
- `npm run test:browser`: Chromium, 360/390/768/1280/1440; 16:9 ба 9:16 player, 5-р үнэгүй → 6-р төлбөртэй анги, video URL хамгаалалт, keyboard/Escape/reduced motion, текстийн contrast ≥4.5, loading/empty/error, non-JSON retry, админ нэвтрэх/форм, 16 MB upload, автомат хадмал, preview/review/publish.
- `/api/jobs`: админд 200, нэвтрээгүй хүсэлтэд 401. Дараагийн оношилгоогоор backend унтарсан үед хуучин rewrite JSON бус 500 буцаадгийг давтаж, request ID-тай JSON 503 болгож зассан. [Дэлгэрэнгүй](RELIABILITY.mn.md).
- Богино синтетик клиптэй live production API шалгалтаар ElevenLabs `scribe_v2`, OpenAI `gpt-4o-2024-08-06`, FFmpeg MP4 болон Монгол SRT/VTT амжилттай гарсан. TTS дуудаагүй. Тайлан: `data/live-check/report.json`.

## Хязгаар

Гадаад сервер/домэйнд deployment хийгдээгүй. Локал production сервер нэг идэвхтэй боловсруулалттай; олон worker queue болон CDN нэмээгүй. Төлбөр нь сервер дээр админ баталгаажуулдаг одоогийн урсгалтай; банкны автомат gateway/webhook байхгүй. Хадмалын утга, нэршил, хурд, цагийн тохирлыг нийтлэхээс өмнө хүн шалгана. Live smoke нь богино синтетик жишээ бөгөөд бүх киноны чанарын баталгаа биш.

## Зураг

- [Өмнөх desktop](screenshots/before/home-1440.png)
- [Шинэ desktop](screenshots/shortkinomn-home-1440.png)
- [Шинэ mobile](screenshots/shortkinomn-home-390.png)
- [Студийн preview](screenshots/shortkinomn-preview-1440.png)
- [Mobile preview](screenshots/shortkinomn-preview-390.png)
- [5 → 6-р ангийн төлөв](screenshots/shortkinomn-next-locked-390.png)
