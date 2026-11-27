PRESETS = [
    {
        "id": "ssrf-webhook",
        "title": "SSRF & Kontrolsüz İstek Tuzağı (URL Meta Çekici & Webhook)",
        "subtitle": "Python / FastAPI · SSRF, yönlendirme ve iç ağ erişimi",
        "language": "Python",
        "analysis_mode": "audit",
        "source_file": "ssrf_webhook.py",
        "prompt": "Eğitim amaçlı bir FastAPI URL metadata çekicisi ve webhook iletim örneği oluştur. İlk taslakta kullanıcı URL'sini yeterince doğrulamayan, yönlendirme ve DNS/IP kontrollerini atlayan, webhook hedefini kısıtlamayan gerçekçi riskleri görünür kıl. Critic SSRF, loopback/private/link-local IP, DNS rebinding, redirect ve protokol bypass'larını bulsun; Refiner güvenli allowlist, her redirect sonrası doğrulama, timeout/yanıt boyutu sınırı ve pytest testleriyle düzeltsin. Final kodu güvenli olsun.",
    },
    {
        "id": "sql-api-key",
        "title": "SQL Injection & Açıkta API Key Sızıntısı (Kullanıcı Sorgu Servisi)",
        "subtitle": "Python / FastAPI · Parametreli sorgu ve secret yönetimi",
        "language": "Python",
        "analysis_mode": "audit",
        "source_file": "sql_injection_secret.py",
        "prompt": "Kullanıcı araması yapan bir Python/FastAPI sorgu servisi için eğitim amaçlı riskli bir ilk taslak üret: kullanıcı girdisi SQL sorgusuna birleştirilsin ve örnek API anahtarı kod/log yanıtlarında açığa çıkabilsin. Critic SQL injection, bilgi sızıntısı ve hata mesajı risklerini bulsun; Refiner parametreli sorgu, ortam değişkeninden secret, redakte loglar ve SQL injection/key leakage pytest testleriyle güvenli final kodu oluştursun.",
    },
    {
        "id": "payment-race",
        "title": "Race Condition / Çifte Harcama Açığı (Eşzamanlı Bakiye Transferi)",
        "subtitle": "Python / FastAPI · Atomiklik, kilit ve idempotency",
        "language": "Python",
        "analysis_mode": "audit",
        "source_file": "double_spend.py",
        "prompt": "Eşzamanlı bakiye transferi için eğitim amaçlı hatalı bir Python/FastAPI ilk taslak oluştur: bakiye okuma ve borçlandırma ayrı olduğu için iki paralel istek çift harcama yapabilsin. Critic race condition, transaction izolasyonu, deadlock ve idempotency açıklarını tespit etsin; Refiner atomik transaction/row lock, sabit kilit sırası, idempotency-key payload kontrolü ve pytest concurrency testleriyle güvenli final kodu üretsin.",
    },
]
