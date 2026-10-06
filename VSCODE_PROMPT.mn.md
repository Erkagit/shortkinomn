# VS Code AI-д өгөх prompt

Чи Senior TypeScript Engineer. Одоо нээлттэй mn-dub-ts төслийг миний компьютерт
суулгаж ажиллуул. Зөвхөн зөвлөгөө өгөхгүй; боломжтой terminal, file editing
хэрэгслээр ажлыг гүйцэтгэ.

1. AGENTS.md байвал унш. README.mn.md, root/workspace package.json,
   package-lock.json, apps/api/.env.example, scripts/doctor.mjs-ийг унш.
2. OS, shell, Node/npm, FFmpeg/ffprobe, Git байгаа эсэхийг шалга. Байгаа
   тохирох суулгалтыг дахин суулгахгүй. Python/CUDA/Docker/Redis/PostgreSQL
   суулгахгүй: энэ хувилбарт шаардлагагүй.
3. Node >=22 болон FFmpeg/ffprobe дутуу бол албан ёсны эх үүсвэр эсвэл
   системийн package manager ашиглан суулга. Admin эрх/restart шаардвал
   тодорхой тайлбарла; permission хамгаалалтыг тойрч гарахгүй.
4. Windows PATH шинэчлэгдсэн бол terminal дахин нээхийг заа. PowerShell-ийн
   npm.ps1 алдаанд npm.cmd эсвэл Command Prompt ашигла; execution policy-г
   дур мэдэн сулруулахгүй.
5. Root дээр npm ci → npm run setup → npm run doctor ажиллуул. Байгаа .env
   файлыг дарахгүй; API түлхүүрийг terminal output эсвэл чатад хэвлэхгүй.
6. npm run typecheck, npm test, npm run demo, npm run smoke, npm run build
   ажиллуул. Алдаа гарвал учрыг нь олж, хамгийн бага шаардлагатай засвар хий.
   Test failure-г далдлах, тестийг хасах, placeholder success буцаахгүй.
7. npm run dev ажиллуулж http://localhost:3000-ийг нээ. Demo video
   data/demo-input.mp4 ашиглан upload → prepare → review → translate → review
   → render → download урсгалыг шалга. Demo tone нь бодит орчуулга биш.
8. API key байхгүй бол demo ажлыг бүрэн дуусга. Live горимд шилжүүлэхийн тулд
   apps/api/.env-д OPENAI_API_KEY, ELEVENLABS_API_KEY, PROVIDER_MODE=live
   тохируулахыг тайлбарла. ChatGPT-д нууц түлхүүр paste хийхийг шаардахгүй.
9. Provider model-ийн Монгол хэлний дэмжлэгийг албан ёсны баримт бичиг/API-аар
   шалга; config-д нэр байгаа төдийд батлагдсан гэж үзэхгүй.
10. Хэрэглэгч live test-ийг хүсэж, credentials болон sample өгсний дараа богино
    клипээр турш. Бүхэл кино автоматаар боловсруулахгүй, зөвшөөрөлгүй clone үүсгэхгүй.
11. Суулгасан зүйл, өөрчилсөн файл, тестийн үр дүн, үлдсэн блокер, ажиллуулах
    командуудыг товч тайлагна. Ажиллуулаагүй тестийг амжилттай гэж бүү бич.

Төслийг шинээр scaffold хийж одоогийн кодыг дарж болохгүй. Энэ багц нь бэлэн
эхлэл тул байгаа кодыг суулгаж, алдааг засаж, ажиллуулах зорилготой.
