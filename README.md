# DevArena

DevArena, yeni görevlerden kod taslağı üretmek veya mevcut kodu güvenlik ve doğruluk açısından incelemek için hazırlanmış çoklu ajanlı bir FastAPI prototipidir. Aşamaları tarayıcıya SSE ile aktarır; bulguları, taslak/final kodu ve üretilen testleri tek ekranda gösterir.

## Akış

1. Yönlendirici görevi ve risk alanını sınıflandırır.
2. Kodlayıcı ilk taslağı üretir. Mevcut kod denetiminde bu aşama atlanır.
3. Eleştirmen güvenlik, hata ve performans bulgularını çıkarır.
4. Düzeltici final kod ve test taslağı üretir.
5. Python test koşucusu testleri proje için ayrı bir sanal ortamda çalıştırır.

Model çıktıları otomatik güvenlik sertifikası değildir; final kod ve bulgular geliştirici tarafından incelenmelidir. Canlı test koşucusu şu anda Python içindir.

## Kurulum

Python 3.12+ gerekir. Örneklerin uygulamaya da gelmesi için depoyu submodule ile klonlayın:

```powershell
git clone --recurse-submodules https://github.com/osmanmemisdev/devarena.git
cd devarena
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

API anahtarlarını yalnızca yerel `.env` dosyasına girin. `.env` Git tarafından yok sayılır; anahtarları kaynak koda, issue'lara veya commit'lere eklemeyin.

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Arayüz: `http://127.0.0.1:8000`

## Depo yapısı

- `static/`: tarayıcı arayüzü
- `main.py`, `pipeline.py`, `schemas.py`, `presets.py`: API ve orkestrasyon
- `examples/`: ayrı özel `devarena-examples` deposuna bağlı submodule

Örnekler kasıtlı olarak zafiyetli eğitim girdileridir. Gerçek sistemlerde çalıştırmayın.
