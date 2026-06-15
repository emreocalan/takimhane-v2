# Takımhane v2 — Proje Planı

> Son güncelleme: Haziran 2026
> Durum: Adım A tamamlandı + 4-Agent Mimari Analizi onaylandı → Adım B'ye geçilecek
> Modül sayısı: **10** (Auth dahil, sidebar'da 9 görünür) | MVP özellik sayısı: **~157**

---

## Proje Özeti

**Uygulama:** AS9100 Uyumlu Takımhane ve Varlık Yönetim Sistemi
**Sektör:** Savunma / Havacılık Metalürji
**Hedef:** Zoller / TDM Systems / Nikken standartlarında, sıfırdan geliştirilmiş dahili yazılım
**Platform:** Web tabanlı, PWA — endüstriyel tabletlerde, takımhane PC'sinde ve barkod el terminallerinde çalışacak

---

## Teknoloji Kararları

| Katman | Seçim | Gerekçe |
|--------|-------|---------|
| Veritabanı + Auth + API | **Supabase** | Yönetilen PostgreSQL, RLS, Auth, PostgREST, Docker gerektirmez |
| Frontend | **React + Vite + Tailwind** | PWA desteği, tablet-friendly, responsive |
| İstemci | **supabase-js** | Frontend doğrudan Supabase'e bağlanır |
| Karmaşık iş mantığı | **Supabase Edge Functions** | Deno tabanlı — alarm, bildirim, life calc için zorunlu |
| Zamanlanmış görevler | **Supabase pg_cron** | Alarm kontrolü, sunucu tarafında çalışır |
| Geliştirme ortamı | **Localhost** | `npm run dev` yeterli, ayrı backend yok |
| Barkod | **USB HID (klavye emülasyonu)** | Standart USB okuyucular, `\n` ile form submit |
| Auth yöntemi | **PIN + opsiyonel RFID** | Operatörler kart okutarak giriş yapacak |

---

## Mimari Kararlar

### ToolDefinition vs ToolInstance Ayrımı (KRİTİK)

```
ToolDefinition  →  "50mm parmak freze nedir?" (katalog, statik)
ToolInstance    →  "Bu rafta duran bu takım nerede, kaç kullanıldı?" (fiziksel, dinamik)
```

Her ToolDefinition'a karşılık birden fazla ToolInstance olabilir. TDM ve Zoller'in temel mimarisi bu ayrım üzerine kuruludur.

### Checkout Servisi — Tek Kaynak (KRİTİK)

Zimmet işlemi sistemde tek bir servis katmanından geçer. İş Emirleri, Dashboard modalı ve Zimmet sayfası hepsi aynı checkout servisini çağırır. Hiçbir modül kendi checkout mantığını yazmaz.

```
İş Emri akışı ──┐
Dashboard modal ─┼──► CHECKOUT SERVİSİ ──► tool_instances + checkouts + wo_items güncelle
Zimmet sayfası ─┘
```

### Alarm Engine — Server-Side Zorunlu

Tüm alarm kontrolleri Edge Function + pg_cron ile sunucu tarafında çalışır. Frontend kapalıyken de tetiklenir. Kalibrasyon tarihi, stok seviyesi, ömür kontrolü, açık zimmet takibi — hepsi backend'de.

### Hibrit EAV Attribute Sistemi

Pure JSONB: arama/validasyon bozulur. Saf EAV: karmaşık. Seçilen hibrit:

```sql
tool_type_attribute_definitions  -- bir tipin hangi alanları var
  (tool_type_id, field_key, field_label, field_type, is_required, options JSONB,
   display_order, unit, validation_rules JSONB)

tool_instance_attributes         -- her fiziksel takımın değerleri
  (instance_id, attribute_definition_id,
   value_text, value_number, value_date, value_boolean, value_file_url)
```

Yeni varlık tipi eklemek = admin panelde form doldurmak. Geliştirici müdahalesi yok.

### Multi-Facility: Baştan facility_id

Şu an tek tesis olsa da tüm kritik tablolara `facility_id` baştan eklenir. Sonradan eklemek migration gerektirir. 6 ay sonra yeni bina geldiğinde sistem tanımlardan yeni tesis eklenir, veri migrasyonu yok.

### Checkout Tipleri

```
1. WO Setup Checkout  →  İş Emri akışından toplu, magazin karşılaştırmalı
2. Hızlı Zimmet       →  Tek takım, üretim devam ederken (kırılma/acil)
```

**Her iki tipte de WO kodu ZORUNLUDUR.** WO sisteme tanımsız gelirse iki yol:
- A) "Hızlı WO Oluştur" (tek buton, minimal form) → anında WO ID üretir
- B) "Geçici Zimmet" → kalite uyarısı ile devam eder, WO sonradan eşleştirilir

### Veri Yazma Sınırları

- CNC magazin durumu yalnızca **M10 CNC & Depo Durumu** üzerinden girilir. İş Emirleri (M3) okur ve karşılaştırır, yazmaz.
- Tedarikçi / ASL verisi yalnızca **M11 Sistem Tanımları** üzerinden yönetilir.

### Bildirim Şablonları DB'de

"Kalibrasyon tarihi yaklaşıyor" gibi e-posta/bildirim metinleri kodda değil, veritabanında `notification_templates` tablosunda saklanır. Admin panelden düzenlenebilir.

### Supabase Mimarisi

```
Supabase Cloud
├── PostgreSQL (tablolar + RLS politikaları)
├── Auth (JWT, PIN/RFID custom claim)
├── PostgREST (şemadan otomatik REST API)
├── Edge Functions (alarm, bildirim, checkout transaction, life calc)
└── pg_cron (zamanlanmış alarm kontrolleri)

Localhost
├── React + Vite + Tailwind (supabase-js + Realtime)
└── Presetter Watcher Servisi (Node.js daemon — arka planda çalışır)
```

---

### Presetter Entegrasyonu — E460N / Heidenhain H Formatı

**Cihaz:** E460N ISO40 Tool Presetter
**Çıktı:** `.H` uzantılı Heidenhain programı (ağ klasörüne düşer)
**Mevcut akış:** Klasör → USB → Heidenhain CNC (tezgaha manuel taşıma)
**Hedef:** Sistemimiz bu dosyayı USB'den önce okur, ölçüm kaydeder, karşılaştırır

**Dosya Formatı (CARICOUT.H):**
```
BEGIN PGM CARICOUT MM
FN 26: TABOPEN TNC:\table\tool.t
QS10 = "TI-0047"        ← Takım barkodu (presetter yazılımında Name alanına girilir)
QL10 = +115.029          ← Boy (L), mm
QL11 = +7.516            ← Yarıçap (R), mm  →  Çap = R × 2 = 15.032 mm
QL12 = +0.000            ← R2 (özel geometri)
FN 27: TABWRITE 40/"NAME" = QS10   ← Pot numarası: 40
FN 27: TABWRITE 40/"L"    = QL10
FN 27: TABWRITE 40/"R"    = QL11
FN 27: TABWRITE 40/"R2"   = QL12
M30
END PGM CARICOUT MM
```

**Presetter yazılımı kurulumu:**
- Name (takım adı) alanına: sistem barkodunu gir (örn. `TI-0047`)
- Dosya adını da aynı yap: `TI-0047.H`
- Watcher: dosya adı + QS10 çift doğrulama — her ikisi barkod olarak işlenir

**Parser (Node.js):**
```javascript
function parseCARICOUT(content) {
  const ql10 = parseFloat(content.match(/QL10\s*=\s*([+-]?\d+\.\d+)/)?.[1]);  // L
  const ql11 = parseFloat(content.match(/QL11\s*=\s*([+-]?\d+\.\d+)/)?.[1]);  // R
  const ql12 = parseFloat(content.match(/QL12\s*=\s*([+-]?\d+\.\d+)/)?.[1]);  // R2
  const qs10 = content.match(/QS10\s*=\s*"([^"]*)"/)?.[1] ?? '';              // Barkod
  const pot  = parseInt(content.match(/TABWRITE\s+(\d+)\//)?.[1]);             // Pot no

  return {
    barcode:     qs10,          // "TI-0047"
    pot_number:  pot,           // 40
    length_mm:   ql10,          // 115.029
    diameter_mm: ql11 * 2,      // 15.032
    r2_mm:       ql12,          // 0.000
  };
}
```

**Bağlam Otomatik Tespiti:**

| ToolInstance Durumu | Ölçüm Bağlamı | İşlem |
|---------------------|---------------|-------|
| Sistemde kayıtsız | **GKK** | Yeni kayıt oluştur, giriş kalite kontrolü yap |
| `Kullanılabilir` | **SETUP** | WO karşılaştır, checkout'a hazırla, offset kaydet |
| `Zimmetli` | **SETUP** | WO'ya offset kaydı, devam eden üretim ölçümü |
| İade başlatıldı | **CHECKIN** | Giriş vs çıkış karşılaştır, ömür kalibrasyonu |

**Tolerans Karşılaştırması:**

```
Nominal (ToolDefinition) vs Ölçülen (QL10/QL11):
  |ölçülen - nominal| ≤ tolerans × 0.8     →  ✓ PASS   (otomatik onay)
  tolerans × 0.8 < fark ≤ tolerans          →  ⚠ KOŞULLU (Kalite imzası)
  |ölçülen - nominal| > tolerans             →  ✗ FAIL   (kullanım engelli)
```

Tolerans eşik yüzdesi (0.8) Sistem Tanımları → 11F'den konfigüre edilebilir.

**Watcher Servisi (yerel Node.js daemon):**
```
Klasör: \\TAKIMHANE-PC\presetter_output\
  ↓ yeni .H dosyası algılandı (chokidar fs watcher)
  ↓ parse et → barcode, L, D, pot
  ↓ Supabase'e yaz → tool_measurements tablosu
  ↓ UI'ya Realtime bildirim → "Presetter ölçümü geldi: TI-0047"
  ↓ Karşılaştırma sonucu → PASS / KOŞULLU / FAIL
```

**Şema Eklentileri:**
```sql
-- Yeni tablo: tüm ölçüm geçmişi
CREATE TABLE tool_measurements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     uuid REFERENCES tool_instances(id),
  measured_at     timestamptz DEFAULT now(),
  context         text CHECK (context IN ('GKK','SETUP','CHECKIN')),
  wo_id           uuid REFERENCES work_orders(id),
  pot_number      int,
  length_mm       numeric(8,3),
  diameter_mm     numeric(8,3),
  r2_mm           numeric(8,3),
  result          text CHECK (result IN ('PASS','CONDITIONAL','FAIL')),
  approved_by     uuid REFERENCES users(id),
  source_file     text,          -- 'TI-0047.H'
  facility_id     uuid REFERENCES facilities(id)
);

-- tool_instances tablosuna ek kolonlar
-- last_length_mm, last_diameter_mm, last_measured_at, last_measurement_result
```

---

## AS9100 İzlenebilirlik Kırılım Noktaları

Denetçi bu 7 noktadan birinde kayıt bulamazsa **Major Nonconformity** yazar:

| # | Kırılım Noktası | Zorunlu Kayıt |
|---|-----------------|---------------|
| 1 | Satın alma / kabul | CoC + giriş kalibrasyonu |
| 2 | Depo / stok | Kimlik + konum kaydı |
| 3 | Zimmet / check-out | Kim + hangi WO + hangi tezgah |
| 4 | Tezgah kullanımı | Hangi parçada kullanıldı (FAIR) |
| 5 | İade / check-in | Durum + ömür güncellemesi |
| 6 | Kalibrasyon döngüsü | Sertifika + izlenebilirlik zinciri |
| 7 | Hurda / bertaraf | İmha belgesi + dijital kilit |

---

## Navigasyon Mimarisi

14 modülden 9 görünür sidebar öğesine konsolidasyon. Auth header'da, Sistem Tanımları yalnızca Admin rolünde.

```
┌─────────────────────────────────┐
│  🏠 Dashboard                   │
│─────────────────────────────────│
│  OPERASYON                      │
│  📋 İş Emirleri                 │
│  📦 Açık Zimmetler & İadeler    │
│  🔄 Yenileme & Bertaraf         │
│─────────────────────────────────│
│  ENVANTER                       │
│  📚 Envanter Kataloğu           │
│  📍 Fiziksel Stok               │
│─────────────────────────────────│
│  KALİTE                         │
│  📐 Kalibrasyon                 │
│  📄 Kayıtlar & Denetim          │
│─────────────────────────────────│
│  İZLEME                         │
│  🖥️ CNC & Depo Durumu           │
│─────────────────────────────────│
│  YÖNETİM (Admin only)           │
│  ⚙️ Sistem Tanımları            │
└─────────────────────────────────┘
```

**Tablet bottom navigation (portrait):** Dashboard / İş Emirleri / Fiziksel Stok / Kalibrasyon / ☰ Diğerleri

---

## Modüller ve Feature List

---

### M1 — Kullanıcı & Yetki Yönetimi (MVP: 3 özellik)

*Auth — sidebar'da görünmez, header profil ikonu + çıkış.*

| # | Özellik | Öncelik |
|---|---------|---------|
| 1.1 | Kullanıcı girişi (PIN / şifre) | MVP |
| 1.2 | Rol tabanlı yetkilendirme (5 temel rol sabit: Admin / Takımhane Sorumlusu / Operatör / Kalite / Salt Okunur) | MVP |
| 1.3 | İzin matrisi — rol-yetki eşleşmesi admin panelinden checkbox olarak yönetilir | MVP |
| 1.4 | Yaka kartı / RFID ile hızlı giriş | v1.1 |
| 1.5 | Active Directory / LDAP entegrasyonu | v2.0 |

---

### M2 — Dashboard (MVP: 15 özellik)

*Sabah ilk açılan ekran. 30 saniyede günün durumu görünmeli.*
*Alarm modülü bu sayfaya entegre — ayrı sidebar öğesi yok.*

**Dashboard Yapısı:**

```
┌─────────────────────────────────────────────────────────┐
│  HIZLI AKSİYONLAR  (her zaman en üstte)                │
│  [🔍 Takım Bulucu] [↗ Zimmet Ver] [↙ Takım İade]      │
│  [💥 Takım Kır] [⚡ Acil Talep]                         │
│  [+ Yeni İş Emri] [📦 Bilemeye Gönder]                 │
├─────────────────────────────────────────────────────────┤
│  KRİTİK UYARILAR 🔴  (alarm motoru buraya besler)      │
│  Kalibrasyonu dolmuş | Bilemede geciken | Stok sıfır   │
├─────────────────────────────────────────────────────────┤
│  DİKKAT GEREKTİREN 🟡                                  │
│  30 gün dolacak alet | Min stok yakın | Ömür %20 altı  │
├──────────────────────┬──────────────────────────────────┤
│  KPI GÖSTERGELERİ   │  BUGÜNÜN HAREKETLERİ             │
│  Kalibrasyon Uyum % │  Zimmet: X | İade: X             │
│  Stok Doluluk %     │  Bilemeye: X | Hurda: X          │
│  Açık NCR Sayısı    │                                  │
├──────────────────────┴──────────────────────────────────┤
│  BİLEMEDE OLANLAR (Mini Tablo)                         │
│  Takım | Bilemeci | Gönderildi | Termin | Durum        │
└─────────────────────────────────────────────────────────┘
```

**Hızlı Aksiyon Detayları:**

| Aksiyon | Açılış | Açıklama |
|---------|--------|---------|
| Takım Bulucu | Fiziksel Stok sayfası (`?mode=finder`) | Specs ile arama, sonuçtan zimmet başlat |
| Zimmet Ver | Modal | Barkod tara → WO kodu → sebep → ver |
| Takım İade | Modal | Barkod tara → durum seç → onayla |
| **Takım Kır** | **Modal** | **Barkod → WO → sistem: hurda yaz + WO not + bildirim + alternatif öner** |
| Acil Talep | Modal | Üretim bekliyor — hızlı talep + bildirim |
| Yeni İş Emri | Tam sayfa | Karmaşık form, tam sayfa gerektirir |
| Bilemeye Gönder | Modal | Takım seç → bilemeci → termin → gönder |

| # | Özellik | Öncelik |
|---|---------|---------|
| 2.1 | Hızlı aksiyonlar şeridi — en üstte sabit | MVP |
| 2.2 | Takım Bulucu butonu → Fiziksel Stok'u search modda açar | MVP |
| 2.3 | Zimmet Ver modal — barkod + WO + sebep | MVP |
| 2.4 | Takım İade modal — barkod + durum | MVP |
| 2.5 | **Takım Kır modal** — tek tıkla kırık takım akışı (hurda + WO not + bildirim + alternatif) | MVP |
| 2.6 | Acil Talep modal — anlık bildirim tetikler | MVP |
| 2.7 | Bilemeye Gönder modal | MVP |
| 2.8 | Kritik uyarılar paneli 🔴 — alarm engine besler | MVP |
| 2.9 | Dikkat uyarılar paneli 🟡 | MVP |
| 2.10 | KPI göstergeleri (trend oklarıyla) | MVP |
| 2.11 | Bugünün hareket özeti | MVP |
| 2.12 | Bilemede olanlar mini tablosu | MVP |
| 2.13 | Global barkod dinleyici — her sayfada aktif, okutunca takım kartı açılır | MVP |
| 2.14 | Alarm zil ikonu (header) — tüm bildirimleri gör, okundu işaretle | MVP |
| 2.15 | Bugünün setupları — saat sıralı WO listesi, tıkla → İş Emri detayı | v1.1 |
| 2.16 | Dashboard widget kişiselleştirme (user_preferences JSONB) | v1.1 |
| 2.17 | Filtre: tezgah / vardiya bazlı dashboard | v1.1 |

**Alarm Engine — Tetiklenen Olaylar (server-side, Edge Function + pg_cron):**

| Alarm | Tetikleyici | Hedef |
|-------|-------------|-------|
| Kalibrasyon yaklaşıyor / doldu | 30 gün / 7 gün / geçti | Kalite + Admin |
| Stok minimum altı | min_stock_level | Takımhane Sorumlusu |
| Takım ömrü %20 altı | life_remaining_pct | Takımhane Sorumlusu |
| Açık zimmet 24 saat | checkout timestamp | Takımhane Sorumlusu |
| Bileme termini yaklaşıyor | 2 gün kala | Takımhane Sorumlusu |
| Acil talep bildirimi | Manual trigger | Admin + Sorumlu |

---

### M3 — İş Emirleri (MVP: 23 özellik)

*İş emri tüm sistemi birbirine bağlayan merkezi entity.*

```
İş Emri Statü Akışı:
Planlandı → Hazırlık → Magazin Karşılaştırma → Ölçüm/Doğrulama → Checkout → Aktif → Tamamlandı
                                                                                  ↘ İptal
```

#### İş Emri Temel Özellikleri

| # | Özellik | Öncelik |
|---|---------|---------|
| 3.1 | WO oluşturma: kod, parça no, parça adı, müşteri/proje | MVP |
| 3.2 | **WO Excel / CSV import** (üretim planlama çıktısından toplu yükleme) | MVP |
| 3.3 | Tezgah ataması + planlanan setup tarihi-saati | MVP |
| 3.4 | Operatör ataması | MVP |
| 3.5 | NC program referans no | MVP |
| 3.6 | WO bazlı takım + tutucu listesi (pot numarası ile) | MVP |
| 3.7 | Takım listesinde eksik/yetersiz stok uyarısı | MVP |
| 3.8 | Ölçüm/doğrulama: nominal vs ölçülen çap/boy | MVP |
| 3.9 | Tolerans kontrolü — otomatik onay/red | MVP |
| 3.10 | Kısmi onay: bazı takımlar onaylı, bazıları beklemede | MVP |
| 3.11 | WO'ya bağlı toplu check-out (checkout servisi çağrılır) | MVP |
| 3.12 | Bekleyen WO listesi ve sıra yönetimi | MVP |
| 3.13 | WO tamamlanınca toplu check-in tetikleme | MVP |
| 3.14 | WO — Parça — Takım ilişkisi raporu (FAIR paketi) | MVP |
| 3.15 | WO geçmişi: aynı parça daha önce hangi takımlarla işlendi | v1.1 |
| 3.16 | Presetter offset değerlerini WO kaydına işleme | v1.1 |
| 3.17 | WO bazlı setup süresi takibi | v1.1 |
| 3.18 | CAM programındaki takım listesini otomatik içe aktarma | v2.0 |
| 3.19 | ERP API entegrasyonu (WO otomatik çekme) | v2.0 |

#### Magazin Karşılaştırma & Setup Optimizasyonu

WO için tezgah seçildiğinde sistem, tezgahın mevcut magazini (M10'dan okunan) ile WO'nun takım listesini karşılaştırır. Sadece değişmesi gereken takımlar için checkout yapılır.

**Not:** Magazin veri girişi yalnızca CNC & Depo (M10) üzerinden yapılır. Bu modül okur.

```
Pot Durumu Göstergesi:
  ✓  Uygun — aynı takım, kalibrasyon/ömür geçerli, kalsın
  ✗  Yanlış takım — değişmeli
  ○  Boş pot — yeni takım gerekli
  ⚠  Ömür kritik — değişim öneriliyor  [v1.1: otomatik projeksiyon]
```

| # | Özellik | Öncelik |
|---|---------|---------|
| 3.20 | Tezgah seçilince anlık magazin durumunu göster (M10'dan okur) | MVP |
| 3.21 | WO takım listesi vs mevcut magazin karşılaştırma ekranı | MVP |
| 3.22 | Pot bazlı durum: ✓ Uygun / ✗ Yanlış / ○ Boş / ⚠ Kritik | MVP |
| 3.23 | "Tüm önerileri kabul et" tek tıkla onay | MVP |
| 3.24 | Manuel düzenleme: hangi takım kalsın / değişsin seçimi | MVP |
| 3.25 | Sadece değişecek takımlar için checkout tetiklenir | MVP |
| 3.26 | Kalan takımlar zimmet kaydında "devam" olarak işaretlenir | MVP |
| 3.27 | WO tamamlanınca magazin durumu otomatik güncellenir | MVP |
| 3.28 | Ömür projeksiyonu (kalan ömür × parça sayısı hesabı) | v1.1 |
| 3.29 | Magazin görsel haritası — pot grid gösterimi | v1.1 |
| 3.30 | Setup optimizasyonu: "Sonraki WO ile X ortak takım var" önerisi | v2.0 |

---

### M4 — Açık Zimmetler & İadeler (MVP: 8 özellik)

*Checkout işlemleri checkout servisi üzerinden yapılır. Bu modülün rolü: açık zimmet listesi, iade akışı, hızlı zimmet formu.*

**WO Esneklik Kuralı:** WO kodu girilemezse iki yol:
- **Hızlı WO:** Tek buton, minimal form, anında WO ID üretir
- **Geçici Zimmet:** Kalite uyarısıyla ilerler, WO sonradan eşleştirilir

| # | Özellik | Öncelik |
|---|---------|---------|
| 4.1 | Hızlı zimmet formu — barkod, WO kodu, operatör, tezgah, sebep | MVP |
| 4.2 | Zimmet tipi: Planlı (WO Setup) / Hızlı (Tek Takım) | MVP |
| 4.3 | Sebep kodu (admin panelden özelleştirilebilir liste) | MVP |
| 4.4 | Çıkışta otomatik kontrol: kalibrasyon geçerli + ömür limiti | MVP |
| 4.5 | Kalibrasyon süresi dolmuş takım zimmetlenemez (kilitli) | MVP |
| 4.6 | Takım iadesi: durum seçimi + ömür güncelleme | MVP |
| 4.7 | WO — Parça — Takım ilişkilendirmesi (FAIR için) | MVP |
| 4.8 | Açık zimmet listesi (iade edilmemiş) | MVP |
| 4.9 | Vardiya devir teslim özeti | v1.1 |
| 4.10 | Toplu zimmet (WO setup için tüm set) | v1.1 |
| 4.11 | CNC offset değerinin tezgaha otomatik gönderimi | v2.0 |

---

### M5 — Yenileme & Bertaraf (MVP: 18 özellik)

*Tek sayfa, iki sekme. Bileme başarısızsa sistem otomatik Bertaraf sekmesine geçer.*
*Eski adı: Bileme & Hurda. Sekme adları: Yenileme / Bertaraf (AS9100 terminolojisi)*

**Hangi varlık tipi hangi sekmeye gider:**

| Varlık Tipi | Yenileme (Bileme) | Bertaraf (Hurda) |
|-------------|--------|-------|
| Kesici takım | Evet | Evet |
| Tutucu | Hayır | Evet |
| Ölçüm aleti | Hayır | Evet |
| Fikstür | Hayır | Evet |
| Mastar | Hayır | Evet |
| Sarf malzeme | Hayır | Evet |

#### Yenileme Sekmesi

| # | Özellik | Öncelik |
|---|---------|---------|
| 5.1 | Bileme sevkiyatı oluştur (tek veya toplu) | MVP |
| 5.2 | Bilemeci seçimi (Sistem Tanımları'ndaki ASL'den) | MVP |
| 5.3 | Gönderim tarihi + termin tarihi | MVP |
| 5.4 | Sevkiyat durumu: Hazırlanıyor / Gönderildi / Bilemecide / Döndü | MVP |
| 5.5 | Gönderilen takımlar otomatik "Bilemede" statüsüne geçer | MVP |
| 5.6 | Dışarıdaki gün sayısı otomatik hesaplanır | MVP |
| 5.7 | Termin geçince otomatik alarm (alarm engine tetikler) | MVP |
| 5.8 | Bileme maliyeti kaydı | MVP |
| 5.9 | Bileme sonucu: Başarılı / Bertaraf | MVP |
| 5.10 | Bileme sayısı sayacı + max limit uyarısı | MVP |
| 5.11 | Bileme sonrası ömür güncelleme | MVP |
| 5.12 | Bileme öncesi/sonrası boyut notu (serbest alan) | MVP |
| 5.13 | Boyut ölçüm karşılaştırma akışı (çap/boy delta) | v1.1 |
| 5.14 | Bil mi / Hurdaya mı? maliyet karşılaştırması | v1.1 |
| 5.15 | Bilemeci performans raporu | v1.1 |

#### Bertaraf Sekmesi

| # | Özellik | Öncelik |
|---|---------|---------|
| 5.16 | Bertaraf önerisi kaydı + sebep kodu | MVP |
| 5.17 | Kalite Mühendisi onay akışı | MVP |
| 5.18 | Onayda dijital kilit (bir daha zimmetlenemez) | MVP |
| 5.19 | Fotoğraf kanıtı yükleme | MVP |
| 5.20 | Bertaraf kaydı arşivi (silinemez, min. 10 yıl) | MVP |
| 5.21 | Bertaraf sonrası otomatik stok düşümü + yenileme tetikleyici | MVP |

---

### M6 — Envanter Kataloğu / ToolDefinition (MVP: 8 özellik)

*"Bu takım türü nedir?" — Statik katalog verisi. Stok sayısı burada tutulmaz.*
*Katalog detay sayfasında "Bu tanıma ait örnekler" bölümü → Fiziksel Stok özeti gösterilir.*

| # | Özellik | Öncelik |
|---|---------|---------|
| 6.1 | Varlık tipi: Kesici Takım / Tutucu / Ölçüm Aleti / Fikstür / Mastar / Sarf | MVP |
| 6.2 | Varlık tipleri dinamik — admin panelden yeni tip eklenebilir | MVP |
| 6.3 | Her tipe özgü dinamik attribute formu (hibrit EAV, admin'den alanlar tanımlanır) | MVP |
| 6.4 | ISO/DIN kod alanı (CNMG 120408, BT40 vb.) | MVP |
| 6.5 | Üretici + üretici parça no + dahili stok kodu | MVP |
| 6.6 | Teknik belge eklentisi (PDF, çizim, katalog) | MVP |
| 6.7 | Teorik ömür limiti (dakika / parça / metre) | MVP |
| 6.8 | Minimum stok seviyesi (reorder point) | MVP |
| 6.9 | Katalog detayında "Bu tanıma ait fiziksel örnekler" özet paneli | MVP |
| 6.10 | Görsel (fotoğraf) yükleme | v1.1 |
| 6.11 | ISO 13399 XML dışa/içe aktarım | v2.0 |

**Varlık Tipi Attribute Özeti:**

| Varlık Tipi | Kritik Özel Alanlar |
|-------------|---------------------|
| Parmak Freze | Çap, helis açısı, diş sayısı, kesme boyu, kaplama, sap tipi |
| Matkap | Çap, nokta açısı, kanal sayısı, mors konik no |
| Insert/Karbür Uç | ISO 1832 kodu (CNMG...), köşe R, kalite kodu, lot no, CoC no |
| Kılavuz | Diş standardı (M/UNC), adım, roll/cut, tek kullanım mı |
| Tutucu | Bağlantı tipi (BT40/HSK-A63), TIR değeri, max devir |
| Ölçüm Aleti | Ölçüm aralığı, çözünürlük, kalibrasyon aralığı |
| Fikstür | Uyumlu tezgahlar, çizim revizyon no, tekrarlılık hassasiyeti |
| Mastar | Go/No-Go limitleri, tolerans sınıfı, aşınma kriteri |

---

### M7 — Fiziksel Stok / ToolInstance (MVP: 12 özellik)

*"Bu rafta duran takım nerede, kaç kullanıldı?" — Dinamik fiziksel kayıt.*

**Takım Bulucu Entegrasyonu:**
Ayrı sayfa yok. Dashboard'daki "Takım Bulucu" butonu bu sayfayı `?mode=finder` parametresiyle açar. Arama modu aktifken specs filtreleri ön plana çıkar, sonuçtan doğrudan zimmet başlatılır.

**Kolon Mimarisi:**
```
Her zaman görünen: Barkod · Tip · Durum · Lokasyon · Kalan Ömür % · Zimmetli ise kime
Tip filtresi seçilince eklenir:
  Parmak Freze → Çap · Kesme Boyu · Helis Açısı · Diş Sayısı · Kaplama
  Matkap       → Çap · Nokta Açısı · Mors Konik
  Insert       → ISO Kodu · Köşe R · Kalite Kodu
  Ölçüm Aleti  → Kalibrasyon Tarihi · Son Tarih · Sertifika No
  Tutucu       → Bağlantı Tipi · TIR · Max Devir
```

**Satın Alma Önerisi:** Stok minimum seviyesinin altına düşünce bu sayfada inline uyarı gösterilir.
*(Eski M6 ayrı modül olarak kaldırıldı — satın alma önerisi buraya, ASL Sistem Tanımları'na taşındı.)*

| # | Özellik | Öncelik |
|---|---------|---------|
| 7.1 | Her fiziksel takım için bağımsız kayıt (seri no / barkod ID) | MVP |
| 7.2 | Durum: Kullanılabilir / Zimmetli / Kalibrasyonda / Bilemede / Karantina / Bertaraf | MVP |
| 7.3 | Depo lokasyonu (dolap-raf-çekmece kodu) | MVP |
| 7.4 | Barkod ile tarama — giriş ve konum güncelleme | MVP |
| 7.5 | Birikimli kullanım sayacı (fiili ömür) | MVP |
| 7.6 | Kalan ömür % hesabı ve alarm eşiği | MVP |
| 7.7 | CoC no ve tedarikçi sertifika arşivi | MVP |
| 7.8 | Lot / seri takibi | MVP |
| 7.9 | Tip filtresi → tip-spesifik kolonlar dinamik görünür (hibrit EAV JOIN) | MVP |
| 7.10 | Takım Bulucu modu: specs filtresi (`?mode=finder`) + ≥ / ≤ / = aralık filtresi | MVP |
| 7.11 | Takım Bulucu sonucundan doğrudan zimmet başlatma | MVP |
| 7.12 | Stok minimum altı satır uyarısı (satın alma önerisi inline) | MVP |
| 7.13 | Bileme / yenileme geçmişi | v1.1 |
| 7.14 | Dışa aktarım: filtre sonucunu Excel'e | v1.1 |
| 7.15 | RFID etiketi bağlantısı | v2.0 |

---

### M8 — Kalibrasyon Yönetimi (MVP: 9 özellik)

*AS9100 Kırılım 6. En yüksek Major NC riskine sahip modül.*

| # | Özellik | Öncelik |
|---|---------|---------|
| 8.1 | Her ölçüm aleti için kalibrasyon takvimi | MVP |
| 8.2 | Otomatik uyarı: 30 gün / 7 gün / süresi doldu (alarm engine tetikler) | MVP |
| 8.3 | Süresi dolan alet otomatik "Kullanım Dışı" — zimmetlenemez | MVP |
| 8.4 | Kalibrasyon sertifikası PDF yükleme ve arşiv | MVP |
| 8.5 | Kalibrasyonda geçirilen süre takibi (gönderim–dönüş) | MVP |
| 8.6 | Akreditasyonlu lab yönetimi (ISO/IEC 17025, TÜRKAK) | MVP |
| 8.7 | Ulusal izlenebilirlik referansı (UME/NIST ref no) | MVP |
| 8.8 | Başarısız kalibrasyon → NCR tetikleme | MVP |
| 8.9 | Sonraki kalibrasyon tarihinin otomatik hesaplanması | MVP |
| 8.10 | Kalibrasyon uyum oranı KPI | v1.1 |

---

### M9 — Kayıtlar & Denetim (MVP: 8 özellik)

*Eski M8 (Raporlar) + M9 (Audit Log) birleşimi. Tek sayfa, iki sekme.*
*Kullanıcı profili: Kalite mühendisi + Admin.*

#### Raporlar Sekmesi

| # | Özellik | Öncelik |
|---|---------|---------|
| 9.1 | Anlık envanter durumu (tüm varlıklar, durum bazlı) | MVP |
| 9.2 | Kalibrasyon takvim raporu (30/60/90 gün) | MVP |
| 9.3 | Açık zimmet listesi raporu | MVP |
| 9.4 | Takım izlenebilirlik raporu (WO bazlı — FAIR için) | MVP |
| 9.5 | Bertaraf kayıt raporu | MVP |
| 9.6 | KPI dashboard raporu | v1.1 |
| 9.7 | Maliyet raporu (tezgah başına takım gideri) | v1.1 |
| 9.8 | PDF / Excel dışa aktarım | v1.1 |
| 9.9 | AS9100 denetim paketi (tek tıkla tüm kayıtlar) | v2.0 |

#### Denetim İzi Sekmesi

| # | Özellik | Öncelik |
|---|---------|---------|
| 9.10 | Her işlem otomatik kaydedilir: kim, ne, ne zaman | MVP |
| 9.11 | Kayıtlar silinemez, sadece görüntülenir | MVP |
| 9.12 | Kayıt değişikliği loglanır (eski / yeni değer) | MVP |
| 9.13 | Filtre: kullanıcı, tarih aralığı, modül bazlı | MVP |
| 9.14 | Audit log dışa aktarımı | v1.1 |

*Her modülde ilgili kayıt detayında "Geçmiş" sekmesi de bulunur — denetim izine derin bağlantı.*

---

### M10 — CNC & Depo Durum Ekranı (MVP: 12 özellik)

*Pasif gösterim değil — akıllı izleme. CNC magazin durumu bu sayfadan girilir.*
*İş Emirleri (M3) bu sayfanın verisini okur, buraya yazmaz.*

**Sayfa yapısı:** Tek sayfa, iki sekme — CNC Magazinleri / Depo & Lokasyonlar

```
┌─────────────────────────────────────────────────────────┐
│  CNC & DEPO DURUM EKRANI          [ CNC ] [ DEPO ] tab │
├─────────────────────────────────────────────────────────┤
│  CNC SEKMESİ                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ VMC-01       │ │ HMC-03       │ │ TRN-02       │   │
│  │ ● Aktif      │ │ ● Aktif      │ │ 🔧 Bakımda   │   │
│  │ WO-26RKT     │ │ WO-31AXB     │ │ —            │   │
│  │ 18/30 pot    │ │ 42/60 pot    │ │ —            │   │
│  │ ⚠ 3 kritik  │ │ ✓ Sağlıklı   │ │              │   │
│  └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                         │
│  [Tezgah tıklanınca] Pot bazlı magazin detayı:         │
│  Pot │ Takım          │ Ömür       │ Durum             │
│   1  │ 50mm Parmak F. │ ▓▓▓░ 78%  │ ✓                 │
│   2  │ M8 Kılavuz     │ ▓░░░ 18%  │ ⚠                 │
│   3  │ 10mm Matkap    │ ░░░░  5%  │ 🔴                │
├─────────────────────────────────────────────────────────┤
│  DEPO SEKMESİ                                           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │
│  │DOL-01  │ │DOL-02  │ │DOL-03  │ │DOL-04  │          │
│  │▓▓▓▓▓▓▓ │ │▓▓▓▓░░░ │ │▓▓░░░░░ │ │⚠ Karma │          │
│  │  %92   │ │  %65   │ │  %30   │ │  tip!  │          │
│  └────────┘ └────────┘ └────────┘ └────────┘          │
└─────────────────────────────────────────────────────────┘
```

#### CNC Magazin Görünümü

| Uyarı | Tetikleyici | Önemi |
|-------|-------------|-------|
| Yüksek takım kırma | Haftada ortalamadan %50 fazla kırık | Tezgah/operatör/parametre sorunu |
| Kritik pot sayısı | 3+ takım %20 ömür altında, aktif WO var | Üretim duruşu riski |
| Ömür verimsizliği | Takımlar teorik ömrün %60'ında ölüyor | v1.1 |
| Setup süresi artışı | Son 5 WO'da trend yukarı | v1.1 |

| # | Özellik | Öncelik |
|---|---------|---------|
| 10.1 | Tüm tezgahların kart görünümü: durum, aktif WO, dolu pot / toplam pot | MVP |
| 10.2 | Tezgah kartında özet uyarı rozetleri | MVP |
| 10.3 | Tezgah detayı: pot bazlı magazin listesi (takım, ömür bar, durum) | MVP |
| 10.4 | Pot renk kodlaması: Yeşil %20+, Sarı %20 altı, Kırmızı kritik, Gri boş | MVP |
| 10.5 | Yüksek takım kırma uyarısı | MVP |
| 10.6 | **Vardiya Teslim Notu** — operatör not bırakır, sonraki vardiyada görünür | MVP |

#### Depo & Lokasyon Görünümü

| Uyarı | Tetikleyici | Önemi |
|-------|-------------|-------|
| Doluluk kritik | Çekmece %90+ dolu | Yeni alım giremez |
| Tip karışıklığı | Ölçüm aleti + kesici aynı çekmece | AS9100 riski |
| Süresi dolmuş alet hatalı lokasyonda | Kalibrasyonu geçmiş, aktif lokasyonda | Major NC riski |
| Ölü stok | 90+ gün hareketsiz | v1.1 |

| # | Özellik | Öncelik |
|---|---------|---------|
| 10.7 | Dolap grid görünümü: doluluk oranı, renk kodlaması | MVP |
| 10.8 | Çekmece detayı: içindekiler listesi ve durum | MVP |
| 10.9 | Doluluk renk skalası: Kırmızı %90+, Sarı %70–90, Yeşil altı | MVP |
| 10.10 | Tip karışıklığı uyarısı | MVP |
| 10.11 | Süresi dolmuş alet hatalı lokasyonda uyarısı | MVP |
| 10.12 | Ölü stok uyarısı (90+ gün hareketsiz) | v1.1 |
| 10.13 | Lokasyon uyumsuzluğu tespiti | v1.1 |
| 10.14 | Tezgah sağlık skoru (bileşik) | v2.0 |
| 10.15 | Tezgahlar arası karşılaştırmalı analiz | v2.0 |

---

### M11 — Sistem Tanımları / No-Code Admin Paneli (MVP: 35 özellik)

*Yalnızca Admin rolü erişir. Kurulum sihirbazı tamamlanmadan sistem tam işlevsel olmaz.*
*İlk kurulum: 10 temel özellik. Geri kalan "Gelişmiş Ayarlar" altında.*

#### İlk Açılış — Kurulum Sihirbazı (7 Adım)

```
Adım 1: Fabrika/tesis bilgileri (ad, adres, AS9100 sertifika no)
Adım 2: Depo hiyerarşisi (en az 1 dolap zorunlu)
Adım 3: CNC tezgahları (en az 1 tezgah zorunlu)
Adım 4: Personel + rol atamaları
Adım 5: Tedarikçiler (opsiyonel, atlanabilir)
Adım 6: Varlık tipleri (hazır şablonlardan seç veya sıfırdan)
Adım 7: Tamamlandı → İlk takımı ekle
```

#### 11A — CNC Tezgah Tanımları

| # | Alan | Örnek | Öncelik |
|---|------|-------|---------|
| 11.1 | Tezgah kodu + adı | VMC-01, Mazak Variaxis 630 | MVP |
| 11.2 | Tezgah tipi | VMC / HMC / Torna / Taşlama / EDM | MVP |
| 11.3 | Marka / Model | DMG Mori / Mazak / Okuma | MVP |
| 11.4 | Magazin kapasitesi (pot sayısı) | 30 / 60 / 120 | MVP |
| 11.5 | Takım bağlantı tipi | BT30 / BT40 / BT50 / HSK-A63 / CAT40 | MVP |
| 11.6 | Maks. takım çapı ve boyu | 80 mm / 300 mm | MVP |
| 11.7 | Bulunduğu alan/hol | Hol-A, CNC Bölgesi 2 | MVP |
| 11.8 | Durum | Aktif / Bakımda / Arıza / Pasif | MVP |
| 11.9 | Sorumlu operatör(ler) | Çoklu seçim | v1.1 |
| 11.10 | DNC bağlantı IP/port | 192.168.1.45:8193 | v2.0 |

#### 11B — Depo & Lokasyon Yapısı

Hiyerarşik ağaç — sürükle-bırak ile düzenlenebilir:
```
Bölge/Alan → Dolap → Raf → Çekmece / Göz
Örnek: A-BLOK / DOL-03 / RAF-2 / CKM-B  →  A-D03-R2-B
```

| # | Alan | Örnek | Öncelik |
|---|------|-------|---------|
| 11.11 | Bölge kodu + adı | A-BLOK, Ölçüm Aleti Odası | MVP |
| 11.12 | Dolap kodu + adı | DOL-01, DOL-02 | MVP |
| 11.13 | Raf + Göz / Çekmece kodu | RAF-1, CKM-A1 | MVP |
| 11.14 | Lokasyon tipi | Kesici Takım / Ölçüm / Fikstür / Sarf | MVP |
| 11.15 | Kapasite (maks. kaç takım) | 20 adet | Opsiyonel |
| 11.16 | Lokasyon etiketi yazdır (barkod) | A-D03-R2-B | v1.1 |

#### 11C — Tedarikçi & ASL Yönetimi

*(Eski M6.2 buraya taşındı. Tedarikçi verisi tek noktadan yönetilir.)*

| # | Alan | Örnek | Öncelik |
|---|------|-------|---------|
| 11.17 | Tedarikçi kodu + firma adı | TDR-001, Sandvik Türkiye | MVP |
| 11.18 | Tedarikçi tipi | Takım Satıcısı / Bilemeci / Kalibrasyon Lab | MVP |
| 11.19 | AS9100 onaylı mı? + onay durumu | Aktif / Askıya Alınmış | MVP |
| 11.20 | Kalibrasyon lab: TÜRKAK akreditasyon no | 17025-XXXX | Koşullu |
| 11.21 | İletişim bilgileri | Telefon, e-posta, adres | MVP |
| 11.22 | Tedarik ettiği malzeme tipleri | Kesici takım, insert, tutucu | v1.1 |
| 11.23 | Ortalama teslimat süresi (gün) | 5 gün | v1.1 |
| 11.24 | Tedarikçi performans analizi (takım ömrü, kırma oranı) | | v2.0 |

#### 11D — Personel Tanımları

| # | Alan | Öncelik |
|---|------|---------|
| 11.25 | Sicil no, ad soyad, rol, vardiya | MVP |
| 11.26 | Durum: Aktif / İzinde / Ayrılmış | MVP |
| 11.27 | Yetki verilen tezgahlar | v1.1 |
| 11.28 | RFID kart no | v1.1 |

#### 11E — Kod & Etiket Listeleri (No-Code, admin özelleştirebilir)

| Liste | Varsayılan Değerler |
|-------|---------------------|
| Zimmet sebep kodları | Kırılma / Aşınma / Kayıp / Ek İhtiyaç / Setup |
| Bertaraf sebep kodları | Ömür Dolumu / Kırılma / Boyut Dışı / Kalibrasyon Başarısız / Hasar |
| Takım durum kodları | Kullanılabilir / Zimmetli / Kalibrasyonda / Bilemede / Karantina / Bertaraf |
| Tezgah durum kodları | Aktif / Bakımda / Arıza / Pasif |
| NCR sebep kodları | Boyut Uyumsuz / Kalibrasyon Dışı / Yetkisiz Kullanım / Belge Eksik |

*`is_system_reserved = true` olan kodlar silinemez (sistmin çalışma mantığına bağlı).*

#### 11F — Alarm & Eşik Ayarları (tesis bazında farklılaştırılabilir)

| Ayar | Varsayılan | Kapsam |
|------|-----------|--------|
| Kalibrasyon uyarı 1 | 30 gün | Global / Tesis |
| Kalibrasyon uyarı 2 | 7 gün | Global / Tesis |
| Ömür uyarı eşiği | %20 | Global / Tesis |
| Açık zimmet alarm | 24 saat | Global |
| Bileme termin uyarısı | 2 gün | Global / Tesis |
| Ölü stok sınırı | 90 gün | Global |

#### 11G — Bildirim Şablonları (DB'de, geliştirici müdahalesi olmadan düzenlenebilir)

| # | Özellik | Öncelik |
|---|---------|---------|
| 11.29 | E-posta şablonları (konu + gövde metin) — her alarm tipi için | MVP |
| 11.30 | In-app bildirim metinleri | MVP |
| 11.31 | SMS şablonları (ileride) | v1.1 |

#### 11H — Varlık Tipi Tanımları (No-Code)

| # | Özellik | Öncelik |
|---|---------|---------|
| 11.32 | Yeni varlık tipi ekle (ad, ikon, renk, iş akışları) | MVP |
| 11.33 | Tipe ait attribute tanımla (key, label, tip, zorunlu, seçenekler) | MVP |
| 11.34 | Alan tipleri: metin, sayı, tarih, select, çoklu seçim, boolean, dosya, barkod | MVP |
| 11.35 | Attribute display_order sürükle-bırak ile sıralama | MVP |

---

## Genel Süreç Akışları

### WO Setup Akışı (Magazin Karşılaştırmalı)

```
WO Oluştur (veya import et) → Takım Listesi Hazırla → Tezgah Seç →
Magazin Karşılaştır (M10'dan oku) → Pot Durumu Göster (✓/✗/○/⚠) →
Onay / Düzenleme → Sadece Değişecekler için Checkout → Aktif → Tamamla → Check-in
```

### Hızlı Zimmet Akışı (Kırılma/Acil)

```
WO kodu (ZORUNLU — tanımlamazsa: Hızlı WO oluştur | Geçici Zimmet) →
Takım barkod tara → Sebep kodu → Kalibrasyon + ömür kontrolü → Ver
```

### Takım Kır Akışı (Dashboard Modal — Tek Tıkla)

```
"Takım Kır" butonu → Barkod tara → WO seç →
Sistem: [hurda yaz] + [WO'ya kırılma notu] + [Takımhane Sorumlusuna bildirim] + [alternatif takım öner]
```

### Kalibrasyon Döngüsü

```
Alarm (30 gün) → Talep oluştur → Gönder → Kalibrasyonda →
Dön → Sertifika yükle → Tarih güncelle → Aktife al
Başarısız → NCR tetikle
```

### Yenileme Döngüsü

```
Ömür doldu / aşındı → Bileme önerisi → Sevkiyat oluştur →
Gönderildi → Bilemecide → Döndü → Bileme sonucu kaydet →
  Başarılı: ömür güncelle → Aktife al
  Başarısız: Bertaraf sekmesine otomatik geç
```

### Bertaraf Akışı

```
Öneri + sebep kodu → Kalite onayı → Dijital kilit →
Fotoğraf → Stok düş → Yenileme tetikle → Arşiv (silinemez)
```

### Presetter Ölçüm Akışları (E460N)

**GKK — Yeni Takım Girişi:**
```
Yeni takım kutudan çıktı → Presetter'da ölç
    → Name alanına barkod yaz → TI-0047.H klasöre düşer
    → Watcher okur → ToolDefinition nominalleri çeker
    → Karşılaştır (L ve D tolerans kontrolü)
    → ✓ PASS: Stoka gir (ToolInstance oluştur, ilk ölçüm kaydı)
    → ⚠ KOŞULLU: Kalite onayı ekranı aç
    → ✗ FAIL: Karantinaya al, tedarikçiye iade talebi oluştur
```

**SETUP — WO Hazırlık Ölçümü:**
```
Takım tutuculara takıldı → Presetter'da ölç → TI-0047.H düşer
    → Watcher: ToolInstance "Kullanılabilir" → SETUP bağlamı
    → Karşılaştır: nominal + önceki ölçüm + WO toleransı
    → UI'da bildirim: "Pot 40 ölçümü geldi"
    → ✓ PASS: Checkout onayı, L/D değerleri WO offset kaydına işlenir
    → ⚠ KOŞULLU: "0.018mm sapma var, onaylıyor musun?" → Kalite imzası
    → ✗ FAIL: Checkout engellendi, alternatif takım öner
    → (Kullanıcı USB'yi alıp Heidenhain tezgaha götürür — mevcut alışkanlık devam)
```

**CHECKIN — İade Sonrası Ölçüm (opsiyonel):**
```
WO tamamlandı → Takım iade → Presetter'da tekrar ölç
    → Giriş ölçümü vs çıkış ölçümü karşılaştır
    → Boyut kaybı hesapla: ΔD, ΔL
    → Kalan ömür kalibrasyonu güncelle
    → "Bu takım X parçada 0.04mm çap kaybetti" → ömür modeli iyileştirme (v1.1)
```

---

## Geliştirme Sprint Planı

### Bağımlılık Zinciri (sıra şart)

```
M11 Temel Tanımlar → M6 Katalog → M7 Fiziksel Stok → M4 Zimmet → M3 İş Emri
```

Paralel geliştirilebilecekler (M7'ye bağımlı ama birbirine değil):
- M8 Kalibrasyon
- M5 Yenileme & Bertaraf

Son aşama: M9 Kayıtlar, M10 CNC Durumu, M2 Dashboard

### Sprint Sırası

| Sprint | Modüller | Amaç |
|--------|---------|------|
| 1 | M1 Auth + M11 Temel (kurulum sihirbazı + CNC/depo/personel) + Audit log altyapısı | Veri tabanı hazır |
| 2 | M6 Katalog + M7 Fiziksel Stok | Takım eklenebilir |
| 3 | M4 Zimmet + M3 İş Emri (magazin karşılaştırmasız, temel WO lifecycle) | İlk zimmet yapılabilir |
| 4 | M2 Dashboard + M10 CNC & Depo | Operasyonel görünürlük |
| 5 | M8 Kalibrasyon + Alarm Engine (Edge Function + pg_cron) | AS9100 uyumlu |
| 6 | M5 Yenileme & Bertaraf + M9 Kayıtlar & Denetim | Tam döngü |
| 7 | Magazin karşılaştırma + gelişmiş özellikler | Optimizasyon |
| 8 | **Presetter Entegrasyonu** (Watcher servisi + GKK akışı + SETUP ölçüm + offset kaydı) | Ölçüm otomasyonu |

---

## MVP'den Çıkarılan Özellikler (v1.1'e Ertelendi)

| Özellik | Neden |
|---------|-------|
| Ömür projeksiyonu (kalan ömür × parça sayısı) | 6 ay veri olmadan anlamsız, yanlış yönlendirir |
| Bileme boyut doğrulama detaylı akışı | Basitleştirildi: tek "bileme sonucu + not" alanı |
| Bugünün setupları dashboard widget'ı | Diğer modüller olgunlaşmadan hatalı veri gösterir |
| Satın Alma bağımsız modülü | M11 (ASL) ve M7 (inline uyarı) ile çözüldü |
| Tedarikçi performans analizi | Faz 2 — 6 ay kullanım verisi gerekiyor |
| Alarm bağımsız modülü (M7 eski) | Dashboard alarm paneline entegre edildi |
| Raporlar + Audit Log ayrı modüller | "Kayıtlar & Denetim" tek modülde birleşti |

---

## Özet Sayılar

| Sürüm | Modül | MVP Özellik | Kapsam |
|-------|-------|-------------|--------|
| **v1.0 (MVP)** | **10** | **~157** | Yayınlanabilir minimum, AS9100 uyumlu |
| v1.1 | 10 | +40 | Ömür projeksiyonu, PDF export, KPI raporlar, RFID |
| v2.0 | 10+ | +25 | ERP entegrasyonu, tezgah sağlık skoru, DNC bağlantısı |

---

## Sonraki Adımlar

- [x] **Adım A** — Feature List + Öncelik Matrisi ✅
- [x] **4-Agent Mimari Analizi** — Onaylandı, plan güncellendi ✅
- [ ] **Adım B** — Supabase Tablo Şeması
  - `facilities`, `users`, `roles`, `permissions`
  - `tool_types`, `tool_type_attribute_definitions`
  - `tool_definitions`, `tool_instances`, `tool_instance_attributes`
  - `work_orders`, `wo_tool_items`, `checkouts`
  - `magazine_machines`, `magazine_slots`, `magazine_assignments`
  - `storage_locations`, `calibrations`, `regrind_orders`, `scrap_records`
  - `alarm_thresholds`, `alarm_events`, `notification_templates`
  - `tool_measurements` (presetter GKK/SETUP/CHECKIN ölçüm geçmişi)
  - `audit_logs`
- [ ] **Adım C** — React proje iskelet kurulumu + Supabase bağlantısı
- [ ] **Adım D** — Sprint 1'den itibaren modül geliştirme
