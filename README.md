# মিসড কল অটো-SMS

Banglalink mConnex প্যানেলের হটলাইনে মিসড কল হলে কলারকে নিজে থেকে একটা দুঃখপ্রকাশের SMS পাঠায়, যেখানে একজন নির্দিষ্ট এজেন্টের নাম আর নাম্বার থাকে।

একটা প্যানেলেই একাধিক সাইট (Coastal Manpower, Creative International, SM Enterprise ইত্যাদি) চালানো যায়, প্রতিটার নিজের mConnex লগইন, এজেন্ট, SMS-এর লেখা আর সেটিংস আলাদা।

## কীভাবে কাজ করে

1. নির্দিষ্ট মিনিট পর পর mConnex-এ নিজে লগইন করে Incoming Call History টানে (ব্রাউজার লাগে না)।
2. প্রতিটা কলের `linkedId` দেখে নতুন কল চেনে। প্রথমবার চালু হলে আগের কলগুলো শুধু রেকর্ড হয়, পুরনো কলারদের SMS যায় না।
3. হটলাইনের নতুন মিসড কল হলে কলারের SMS লাইনে রাখে।
4. সময় হলে এজেন্ট বেছে SMS পাঠায়:
   - **একই কলার = একই এজেন্ট**, যতবারই কল করুন।
   - নতুন কলাররা **রাউন্ড রবিনে** একজন একজন করে এজেন্ট পান।
   - এজেন্ট বন্ধ করলে তার কলাররা পরের বার নতুন একজন সক্রিয় এজেন্ট পান।
5. বাদ পড়ে যেসব ক্ষেত্রে:
   - কুলডাউনের মধ্যে (ডিফল্ট ৭ দিন) একই নাম্বারে আগেই SMS গেছে, অর্থাৎ বারবার মিসড কল দিলেও SMS একটাই।
   - মিসড কলের পরে কলারের সাথে কথা হয়ে গেছে (ANSWERED কল পাওয়া গেছে)।
   - নাম্বারটা মোবাইল নয় (যেমন 09xxx)।
   - অন্য হটলাইনের মিসড কল।
6. রাতে SMS বন্ধ থাকার সময় (ডিফল্ট রাত ১০টা–সকাল ৮টা) এলে SMS লাইনে থাকে, সকালে যায়।

সব নিয়মের সংখ্যা প্যানেলের **সেটিংস** থেকে বদলানো যায়।

## Hostinger VPS-এ বসানো (প্রথমবার)

VPS-এ SSH দিয়ে ঢুকে একটার পর একটা কমান্ড চালান:

```bash
# ১. Node.js 20, git আর বিল্ড টুল
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential
sudo npm install -g pm2

# ২. কোড নামানো (আপনার রেপোর ঠিকানা দিন)
cd /var/www
git clone https://github.com/<আপনার-ইউজারনেম>/missed-call-sms.git
cd missed-call-sms
npm install --omit=dev

# ৩. সেটিংস ফাইল
cp .env.example .env
nano .env      # ADMIN_PASSWORD আর SESSION_SECRET অবশ্যই বদলান

# ৪. চালু করা, আর সার্ভার রিস্টার্ট হলেও যেন নিজে চালু হয়
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # যে কমান্ডটা দেখাবে সেটা কপি করে চালান
```

এখন প্যানেল খুলবে `http://<VPS-এর-IP>:3100` ঠিকানায়। (ফায়ারওয়াল চালু থাকলে `sudo ufw allow 3100`)

### ডোমেইন দিয়ে খোলা (ঐচ্ছিক, সুপারিশ করা হয়)

যেমন `sms.coastalmanpoweragency.com`। DNS-এ ডোমেইনটা VPS-এর IP-তে পয়েন্ট করে:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/missed-call-sms >/dev/null <<'EOF'
server {
  server_name sms.coastalmanpoweragency.com;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 600s;
  }
}
EOF
sudo ln -s /etc/nginx/sites-available/missed-call-sms /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d sms.coastalmanpoweragency.com
```

তারপর `.env`-এ `COOKIE_SECURE=true` দিয়ে `pm2 restart missed-call-sms` চালান।

## প্রথমবার সেটআপ (প্যানেল থেকে)

1. প্যানেলে লগইন করে **নতুন সাইট যোগ করুন**।
2. **সেটিংস** → mConnex লগইন নাম ও পাসওয়ার্ড দিন। **SMS কোম্পানি** বেছে নিন (Softcents বা BulkSMSBD) আর সেই কোম্পানির তথ্য দিন — Softcents হলে Client ID, Client Secret ও Sender ID; BulkSMSBD হলে API Key ও Sender ID → সেভ।
3. **সারাংশ** → "mConnex লগইন টেস্ট" চাপুন। সফল হলে হটলাইন নাম্বার নিজে বসে যায়।
4. "SMS ব্যালেন্স দেখুন" চাপুন — ব্যালেন্স দেখালে বুঝবেন SMS কোম্পানির তথ্য ঠিক আছে। (BulkSMSBD হলে ওদের প্যানেলে IP হোয়াইটলিস্ট বন্ধ করুন, অথবা VPS-এর IP যোগ করুন।)
5. "টেস্ট SMS পাঠান"-এ নিজের নাম্বার দিয়ে দেখুন SMS কেমন যায়।
6. **এজেন্ট** → "একসাথে অনেক এজেন্ট যোগ"-এ Sheet থেকে নাম আর নাম্বার পেস্ট করুন।
7. **সেটিংস** → "সিস্টেম চালু" টিক দিন, **টেস্ট মোড চালু রেখেই**।
8. কয়েক ঘণ্টা **SMS লগ** দেখুন: কাকে, কোন এজেন্টের নাম্বার দিয়ে, কী লেখা যেত। সব ঠিক থাকলে টেস্ট মোড বন্ধ করুন। এবার আসল SMS যাবে।

## আরো সাইট যোগ করা

**এক প্যানেলেই:** "নতুন সাইট যোগ করুন" দিয়ে Creative, SM Enterprise ইত্যাদি যোগ করুন। প্রতিটা আলাদাভাবে চলবে।

**আলাদা সার্ভার বা আলাদা কপিতে:** একই রেপো আরেকটা ফোল্ডারে ক্লোন করে `.env`-এ আলাদা `PORT` দিন, তারপর আলাদা নামে চালান:

```bash
git clone https://github.com/<ইউজারনেম>/missed-call-sms.git /var/www/missed-call-creative
cd /var/www/missed-call-creative && npm install --omit=dev && cp .env.example .env && nano .env   # PORT=3101
pm2 start src/server.js --name missed-call-creative && pm2 save
```

## কোড আপডেট হলে

```bash
cd /var/www/missed-call-sms
git pull
npm install --omit=dev
pm2 restart missed-call-sms
```

ডেটা (`data/app.db`) আলাদা ফাইলে থাকে, আপডেটে মুছে যায় না। মাঝে মাঝে এই ফাইলের একটা কপি রেখে দেওয়া ভালো।

## জেনে রাখা ভালো

- **mConnex ধীর:** mConnex একেকটা অনুরোধের উত্তর দিতে কয়েক মিনিট পর্যন্ত নিতে পারে। তাই কল টানা ব্যাকগ্রাউন্ডে চলে, আর এর মধ্যেও লাইনের SMS সময়মতো যেতে থাকে। সেটিংসে "প্রতি পেজে কতটা কল আনবে" বড় রাখুন (৫০০), যাতে একবারের অনুরোধেই সব কল আসে। "mConnex-এর উত্তরের জন্য সর্বোচ্চ অপেক্ষা" দরকার হলে বাড়ান। সংযোগ যাচাই করতে চালান `node scripts/check-mconnex.js`।

- **বাংলা SMS-এর খরচ:** বাংলা SMS-এ প্রতি ভাগে ৭০ অক্ষর ধরে (ইংরেজিতে ১৬০)। ডিফল্ট লেখাটা প্রায় ২ ভাগ, তাই প্রতি কলারে ২টি SMS-এর খরচ হতে পারে। লেখা ছোট করলে খরচ কমবে।
- **পাসওয়ার্ড বদলালে:** mConnex-এর পাসওয়ার্ড বদলালে প্যানেলের সেটিংসেও নতুনটা দিন।
- **একটাই প্রসেস:** PM2-এ একটার বেশি instance চালাবেন না, তাহলে একই SMS দুবার যেতে পারে।
- **টেস্ট:** `npm test` নকল mConnex আর নকল SMS সার্ভার দিয়ে সব নিয়ম যাচাই করে (কোনো আসল SMS যায় না)।

## ফাইল

| ফাইল | কাজ |
|---|---|
| `src/server.js` | প্যানেল (Express) আর চালু হওয়ার জায়গা |
| `src/engine.js` | কল টানা, এজেন্ট বণ্টন, SMS লাইন ও পাঠানো |
| `src/mconnex.js` | mConnex লগইন ও কল রিপোর্ট |
| `src/sms.js` | SMS পাঠানো (Softcents, BulkSMSBD) |
| `src/db.js` | ডেটাবেস (SQLite) আর সব সেটিংসের তালিকা |
| `test/run-test.js` | পুরো সিস্টেমের টেস্ট |
