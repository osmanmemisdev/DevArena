(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const stageIds = ['routing', 'generating', 'critiquing', 'refining'];
  let presets = [];
  let currentResult = null;
  let history = readHistory();
  let analysisMode = 'generate';
  let githubBranch = '';
  let githubRepository = '';
  let githubSourceReference = null;
  let githubImportedContent = '';
  let stageTimer = null;
  let activeStageStartedAt = 0;
  const modeDrafts = { generate: '', audit: '' };
  let locale = 'tr';
  const messages = {
    tr: {
      workspace: 'ÇALIŞMA ALANI', dashboard: 'Analiz Kokpiti', newAnalysis: 'Yeni analiz', sessions: 'SON OTURUMLAR',
      noHistory: 'Henüz analiz yok', vulnerabilities: 'YAKALANAN AÇIK', totalFindings: 'Toplam bulgu', scoreImprovement: 'SKOR İYİLEŞMESİ',
      averageGain: 'Ortalama puan artışı', checking: 'Bağlantı denetleniyor', liveReady: 'Canlı model hazır', noApi: 'Canlı API bağlantısı yok',
      view: 'Görünüm', language: 'Dil', themeDark: 'Gece', themeLight: 'Beyaz', themePink: 'Pembe',
      heroEyebrow: 'ÇOKLU AJAN MÜHENDİSLİK', heroTitle: 'Kodu üret. Denetle.<br><em>Güvenle iyileştir.</em>',
      heroDescription: 'Uzman modelleri tek bir akışta birleştir. İlk taslaktan güvenlik denetimine, test edilmiş final koda.',
      generateMode: 'Sıfırdan Kod Üret', auditMode: 'Mevcut Kodumu Denetle', githubHeading: 'Herkese açık GitHub deposundan Python dosyası seç',
      githubOptional: 'İSTEĞE BAĞLI KAYNAK', githubInitial: 'Dosyayı seçince kod aşağıdaki kutuya yüklenir.',
      githubLoad: 'Dosyaları Listele', githubPrivacy: 'Yalnızca herkese açık depolar desteklenir. Seçtiğiniz dosya analiz sırasında NVIDIA NIM\'e gönderilir. İlk sürümde sadece Python dosyaları listelenir.',
      taskLabel: 'GÖREV TANIMI', codeLabel: 'DENETLENECEK KOD', taskTitle: 'Neyi inşa ediyoruz?', codeTitle: 'Mevcut kodu yapıştır',
      languagePython: 'Programlama dili', fastReview: 'Hızlı inceleme', deepReview: 'Derin inceleme', fastNote: 'Hızlı inceleme Critic için aktif hızlı modeli, final kod ve testler için Gemini Flash-Lite kullanır.',
      deepNote: 'Derin inceleme Critic için Nemotron 550B, final kod ve testler için Gemini 3.8 Flash kullanır; daha uzun sürebilir.',
      promptGenerate: 'Görevi ve önemli gereksinimleri tanımla… Örn: rate limiting destekli, güvenli bir FastAPI endpoint\'i oluştur.',
      promptAudit: 'Denetlemek istediğin Python / TypeScript / Go / SQL kodunu buraya yapıştır…', quickScenarios: 'HIZLI SENARYOLAR',
      runAnalysis: 'Analizi başlat', analyzeNote: 'Kodunuz seçtiğiniz inceleme düzeyinde değerlendirilecek', livePipeline: 'CANLI İŞ AKIŞI', pipelineTitle: 'Analiz adımları',
      readyStart: 'Hazır olduğunuzda başlayabiliriz', router: 'Yönlendirici', coder: 'Kodlayıcı', critic: 'Eleştirmen', refiner: 'Düzeltici', waitingModel: 'Model bekleniyor',
      resultLabel: 'ANALİZ SONUCU', resultTitle: 'İnceleme sonuçları', firstDraft: 'İLK TASLAK', finalCode: 'FINAL KOD', securityFindings: 'Güvenlik bulguları', codeCompare: 'Kod karşılaştırması', testsTab: 'Testler',
      findingsPlaceholder: 'Analiz tamamlandığında bulgular burada listelenir.', noFindings: 'Kritik bulgu tespit edilmedi.',
      draftGenerated: 'ÜRETİLEN TASLAK', userCode: 'KULLANICI KODU', safeFinal: 'GÜVENLİ FINAL', copyCode: 'Kodu kopyala', download: 'İndir',
      testsGenerated: 'ÜRETİLEN TEST SUİTİ', copyTests: 'Testleri kopyala', runTests: 'Testleri Canlı Çalıştır', projectLabel: 'Proje etiketi (ortamları ayırır)',
      profileLabel: 'Hazır Python paket grubu', profileAuto: 'Otomatik seç', profileBasic: 'Temel — NumPy, Requests, Pillow, HTTPX',
      profileVision: 'Görüntü — MediaPipe Hands uyumlu', profileDesktop: 'Masaüstü — PyAutoGUI, Pycaw, comtypes', profileData: 'Veri bilimi — Pandas, SciPy, Matplotlib',
      profileWeb: 'API — FastAPI, Pydantic, HTTPX', profileCustom: 'Yalnız requirements.txt', requirementsLabel: 'Bu proje için requirements.txt (isteğe bağlı)',
      requirementsPlaceholder: 'Boş bırak: import\'lardan tahmin edilsin\nÖrnek:\nopencv-python-headless\nmediapipe',
      testHelp: 'Her proje etiketi ve bağımlılık listesi için ayrı Python ortamı hazırlanır. İlk kurulum biraz sürebilir; aynı proje ortamı sonraki testlerde yeniden kullanılır. Ağır paketlerde testler 90 saniyeye kadar sürebilir.',
      terminal: 'TEST KOŞUCUSU', testReady: 'Hazır', testOutput: 'Testleri çalıştırınca terminal çıktısı burada görünür.',
      footer: 'NVIDIA NIM ile güçlendirilmiştir', starting: 'Analiz başlatılıyor…', analysing: 'Analiz sürüyor…', estimatedTokens: 'tahmini token',
      routing: 'İstek değerlendiriliyor', generating: 'Kod taslağı hazırlanıyor', critiquing: 'Güvenlik incelemesi sürüyor', refining: 'Düzeltme ve testler hazırlanıyor',
      stageRunning: 'Aşama sürüyor', analysisComplete: 'Analiz tamamlandı', analysisFailed: 'Analiz tamamlanamadı',
      minPrompt: 'Görev tanımı en az 8 karakter olmalı.', loadScenariosFailed: 'Senaryolar yüklenemedi',
      localScenarioLoaded: 'Yerel demo örneği yüklendi', noAnalysis: 'Önce canlı analizle final kod ve testleri üret.',
      pythonOnly: 'Canlı Python test koşucusu yalnızca Python kodu çalıştırır.', preparingTests: 'Proje ortamı hazırlanıyor, ardından pytest çalışacak…',
      dependencyError: 'Bağımlılık hatası', testTimeout: 'Zaman aşımı', passed: 'BAŞARILI', failed: 'BAŞARISIZ',
      testSuccessToast: 'Testler başarılı.', testFailureToast: 'Testler başarısız; terminal çıktısını incele.', testRequestError: 'Test runner isteği başarısız oldu.',
      copied: 'Panoya kopyalandı.', copyFailed: 'Panoya erişim sağlanamadı.', newReady: 'Yeni görev için hazır.',
      analysisRequestFailed: 'Analiz isteği başarısız', streamClosed: 'Akış tamamlanmadan kapandı.',
      repoNoFiles: 'Bu depoda uygun boyutta Python dosyası bulunamadı.', repoSelectFile: 'İncelenecek dosyayı seçin…',
      repoFileMissing: 'Python dosyası bulunamadı', repoFilesFailed: 'Dosya listesi yüklenemedi', repoListFailed: 'GitHub deposu okunamadı.',
      repoLoading: 'dosyası alınıyor…', repoLoaded: 'yüklendi. Kod kutusunu inceleyin, sonra boru hattını başlatın.',
      repoListFound: 'Python dosyası bulundu.',
      repoEmpty: 'Önce GitHub depo bağlantısını girin.', repoChecking: 'Herkese açık depo kontrol ediliyor…', repoLoadingFiles: 'Dosyalar yükleniyor…',
      repoFirstLoad: 'Önce bir depo yükleyin', repoListPrefix: 'deposunun', repoBranch: 'dalında', repoFilesSuffix: 'Python dosyası bulundu.',
      repoTruncated: ' İlk 300 dosya listelendi.', repoEdited: 'Kod elle değiştirildi; analiz bu düzenlenmiş kod üzerinden yapılacak.',
      lineLabel: 'SATIR', hardened: 'GÜVENLİ',
    },
    en: {
      workspace: 'WORKSPACE', dashboard: 'Analysis Cockpit', newAnalysis: 'New analysis', sessions: 'RECENT SESSIONS',
      noHistory: 'No analyses yet', vulnerabilities: 'ISSUES FOUND', totalFindings: 'Total findings', scoreImprovement: 'SCORE IMPROVEMENT',
      averageGain: 'Average score gain', checking: 'Checking connection', liveReady: 'Live model ready', noApi: 'Live API unavailable',
      view: 'Theme', language: 'Language', themeDark: 'Dark', themeLight: 'Light', themePink: 'Pink',
      heroEyebrow: 'MULTI-AGENT ENGINEERING', heroTitle: 'Build code. Review it.<br><em>Improve it safely.</em>',
      heroDescription: 'Bring specialist models into one workflow, from first draft and security review to tested final code.',
      generateMode: 'Generate from scratch', auditMode: 'Review my code', githubHeading: 'Choose a Python file from a public GitHub repository',
      githubOptional: 'OPTIONAL SOURCE', githubInitial: 'The selected file will be loaded into the code box below.',
      githubLoad: 'List files', githubPrivacy: 'Only public repositories are supported. The selected file is sent to NVIDIA NIM for analysis. This version lists Python files only.',
      taskLabel: 'TASK DESCRIPTION', codeLabel: 'CODE TO REVIEW', taskTitle: 'What are we building?', codeTitle: 'Paste existing code',
      languagePython: 'Programming language', fastReview: 'Fast review', deepReview: 'Deep review', fastNote: 'Fast review uses the active fast model for Critic and Gemini Flash-Lite for final code and tests.',
      deepNote: 'Deep review uses Nemotron 550B for Critic and Gemini 3.8 Flash for final code and tests; it may take longer.',
      promptGenerate: 'Describe the task and key requirements… e.g. build a secure FastAPI endpoint with rate limiting.',
      promptAudit: 'Paste Python, TypeScript, Go, or SQL code to review…', quickScenarios: 'QUICK SCENARIOS',
      runAnalysis: 'Start analysis', analyzeNote: 'Your code will be reviewed at the selected depth', livePipeline: 'LIVE WORKFLOW', pipelineTitle: 'Analysis stages',
      readyStart: 'Ready when you are', router: 'Router', coder: 'Coder', critic: 'Critic', refiner: 'Refiner', waitingModel: 'Waiting for model',
      resultLabel: 'ANALYSIS RESULT', resultTitle: 'Review results', firstDraft: 'FIRST DRAFT', finalCode: 'FINAL CODE', securityFindings: 'Security findings', codeCompare: 'Code comparison', testsTab: 'Tests',
      findingsPlaceholder: 'Findings will appear here when analysis is complete.', noFindings: 'No critical findings detected.',
      draftGenerated: 'GENERATED DRAFT', userCode: 'USER CODE', safeFinal: 'SECURE FINAL', copyCode: 'Copy code', download: 'Download',
      testsGenerated: 'GENERATED TEST SUITE', copyTests: 'Copy tests', runTests: 'Run tests live', projectLabel: 'Project label (separates environments)',
      profileLabel: 'Python package profile', profileAuto: 'Auto select', profileBasic: 'Basic — NumPy, Requests, Pillow, HTTPX',
      profileVision: 'Vision — MediaPipe Hands compatible', profileDesktop: 'Desktop — PyAutoGUI, Pycaw, comtypes', profileData: 'Data science — Pandas, SciPy, Matplotlib',
      profileWeb: 'API — FastAPI, Pydantic, HTTPX', profileCustom: 'requirements.txt only', requirementsLabel: 'requirements.txt for this project (optional)',
      requirementsPlaceholder: 'Leave blank to infer from imports\nExample:\nopencv-python-headless\nmediapipe',
      testHelp: 'Each project label and dependency list gets its own Python environment. The first install may take a while; later runs reuse it. Heavy packages may take up to 90 seconds to test.',
      terminal: 'TEST RUNNER', testReady: 'Ready', testOutput: 'Run tests to see terminal output here.',
      footer: 'Powered by NVIDIA NIM', starting: 'Starting analysis…', analysing: 'Analysis in progress…', estimatedTokens: 'estimated tokens',
      routing: 'Evaluating request', generating: 'Generating code draft', critiquing: 'Reviewing security', refining: 'Refining code and tests',
      stageRunning: 'Stage in progress', analysisComplete: 'Analysis complete', analysisFailed: 'Analysis failed',
      minPrompt: 'Task description must be at least 8 characters.', loadScenariosFailed: 'Could not load scenarios',
      localScenarioLoaded: 'Loaded local demo scenario', noAnalysis: 'Run a live analysis to generate final code and tests first.',
      pythonOnly: 'The live test runner currently runs Python code only.', preparingTests: 'Preparing the project environment, then pytest will run…',
      dependencyError: 'Dependency error', testTimeout: 'Timed out', passed: 'PASSED', failed: 'FAILED',
      testSuccessToast: 'Tests passed.', testFailureToast: 'Tests failed; review the terminal output.', testRequestError: 'Test runner request failed.',
      copied: 'Copied to clipboard.', copyFailed: 'Clipboard access was unavailable.', newReady: 'Ready for a new task.',
      analysisRequestFailed: 'Analysis request failed', streamClosed: 'The stream ended before completion.',
      repoNoFiles: 'No suitable Python files were found in this repository.', repoSelectFile: 'Select a file to review…',
      repoFileMissing: 'No Python files found', repoFilesFailed: 'Could not load the file list', repoListFailed: 'Could not read the GitHub repository.',
      repoLoading: 'is loading…', repoLoaded: 'loaded. Review the code, then start the pipeline.',
      repoListFound: 'Python files found.',
      repoEmpty: 'Enter a GitHub repository URL first.', repoChecking: 'Checking public repository…', repoLoadingFiles: 'Loading files…',
      repoFirstLoad: 'Load a repository first', repoListPrefix: 'repository, branch', repoBranch: '', repoFilesSuffix: 'Python files found.',
      repoTruncated: ' First 300 files shown.', repoEdited: 'Code was edited; the analysis will use this version.',
      lineLabel: 'LINE', hardened: 'HARDENED',
    },
  };
  const labelMap = [
    ['.workspace-label', 'workspace'], ['.breadcrumbs span', 'workspace'], ['.breadcrumbs b', 'dashboard'],
    ['#newAnalysis span', 'newAnalysis'], ['.side-section .section-heading', 'sessions'], ['.metric-card:nth-child(1) .metric-label', 'vulnerabilities'],
    ['.metric-card:nth-child(1) .metric-foot', 'totalFindings'], ['.metric-card:nth-child(2) .metric-label', 'scoreImprovement'],
    ['.metric-card:nth-child(2) .metric-foot', 'averageGain'], ['#modeLabel', 'checking'], ['.theme-picker > span', 'view'],
    ['.locale-picker > span', 'language'], ['.hero .eyebrow', 'heroEyebrow'], ['.hero p', 'heroDescription'],
    ['#modeGenerate', 'generateMode'], ['#modeAudit', 'auditMode'], ['#githubImporter .github-import-heading b', 'githubHeading'],
    ['#githubImporter .label-overline', 'githubOptional'],
    ['#loadGithubFiles', 'githubLoad'], ['.github-privacy', 'githubPrivacy'], ['#promptOverline', 'taskLabel'], ['#promptTitle', 'taskTitle'],
    ['#reviewDepth option[value="fast"]', 'fastReview'], ['#reviewDepth option[value="deep"]', 'deepReview'], ['#reviewDepthNote', 'fastNote'],
    ['.preset-row > span', 'quickScenarios'], ['.request-footer > span', 'analyzeNote'], ['#runButton span', 'runAnalysis'],
    ['.pipeline-section .label-overline', 'livePipeline'], ['.pipeline-section h2', 'pipelineTitle'],
    ['[data-stage="routing"] .node-copy b', 'router'], ['[data-stage="generating"] .node-copy b', 'coder'],
    ['[data-stage="critiquing"] .node-copy b', 'critic'], ['[data-stage="refining"] .node-copy b', 'refiner'],
    ['.result-top .label-overline', 'resultLabel'], ['.result-top h2', 'resultTitle'], ['.score-compare > div:first-child small', 'firstDraft'],
    ['.score-compare .final-score small', 'finalCode'], ['button[data-tab="audit"]', 'securityFindings'], ['button[data-tab="code"]', 'codeCompare'],
    ['button[data-tab="tests"]', 'testsTab'],
    ['#panel-tests .code-actions > span', 'testsGenerated'],
    ['.code-file', 'safeFinal'], ['#copyFinal', 'copyCode'], ['#downloadFinal', 'download'], ['#copyTests', 'copyTests'],
    ['#runTestsButton', 'runTests'], ['label[for="testProjectKey"]', 'projectLabel'], ['label[for="testProfile"]', 'profileLabel'],
    ['label[for="testRequirements"]', 'requirementsLabel'], ['.test-dependencies-help', 'testHelp'], ['.terminal-head b', 'terminal'],
    ['#testRunStatus', 'testReady'], ['footer > span:last-child', 'footer'],
  ];

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem('devarena-history') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function t(key) {
    return messages[locale]?.[key] ?? messages.tr[key] ?? key;
  }

  function setLabel(selector, value) {
    $$(selector).forEach((element) => {
      const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (textNode) textNode.textContent = value;
      else element.textContent = value;
    });
  }

  function localizedPreset(preset, field) {
    const presetText = {
      'ssrf-webhook': {
        title: ['SSRF & Kontrolsüz İstek Tuzağı (URL Meta Çekici & Webhook)', 'SSRF & Unrestricted Requests (URL Preview & Webhook)'],
        subtitle: ['Python · SSRF, yönlendirme ve iç ağ erişimi', 'Python · SSRF, redirects, and private network access'],
      },
      'sql-api-key': {
        title: ['SQL Injection & Açıkta API Key Sızıntısı (Kullanıcı Sorgu Servisi)', 'SQL Injection & Exposed API Key (User Search Service)'],
        subtitle: ['Python · Parametreli sorgu ve secret yönetimi', 'Python · Parameterized queries and secret handling'],
      },
      'payment-race': {
        title: ['Race Condition / Çifte Harcama Açığı (Eşzamanlı Bakiye Transferi)', 'Race Condition / Double-Spend (Concurrent Balance Transfer)'],
        subtitle: ['Python · Atomiklik, kilit ve idempotency', 'Python · Atomicity, locking, and idempotency'],
      },
    };
    return presetText[preset.id]?.[field]?.[locale === 'en' ? 1 : 0] || preset[field] || '';
  }

  function readLocale() {
    try { return localStorage.getItem('devarena-locale') === 'en' ? 'en' : 'tr'; } catch { return 'tr'; }
  }

  function applyLocale(nextLocale) {
    locale = nextLocale === 'en' ? 'en' : 'tr';
    document.documentElement.lang = locale;
    const selector = $('#localeSelector');
    if (selector) selector.value = locale;
    for (const [target, key] of labelMap) setLabel(target, t(key));
    const heroTitle = $('.hero h1');
    if (heroTitle) heroTitle.innerHTML = t('heroTitle');
    const codeAction = $('#panel-code .code-actions > span');
    const trailingText = codeAction && [...codeAction.childNodes].reverse().find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (trailingText) trailingText.textContent = ` ${t('safeFinal')}`;
    if (!$('.terminal-card')?.dataset.status) {
      const testStatus = $('#testRunStatus');
      const testOutput = $('#testOutput');
      if (testStatus) testStatus.textContent = t('testReady');
      if (testOutput) testOutput.textContent = t('testOutput');
    }
    const setOption = (selector, value, key) => {
      const option = $(`${selector} option[value="${value}"]`);
      if (option) option.textContent = t(key);
    };
    setOption('#themeSelector', 'dark', 'themeDark');
    setOption('#themeSelector', 'light', 'themeLight');
    setOption('#themeSelector', 'pink', 'themePink');
    setOption('#testProfile', 'auto', 'profileAuto');
    setOption('#testProfile', 'basic', 'profileBasic');
    setOption('#testProfile', 'vision', 'profileVision');
    setOption('#testProfile', 'desktop', 'profileDesktop');
    setOption('#testProfile', 'data', 'profileData');
    setOption('#testProfile', 'web', 'profileWeb');
    setOption('#testProfile', 'custom', 'profileCustom');
    const prompt = $('#prompt');
    if (prompt) prompt.placeholder = analysisMode === 'audit' ? t('promptAudit') : t('promptGenerate');
    const modeOverline = $('#promptOverline');
    const modeTitle = $('#promptTitle');
    if (modeOverline) modeOverline.textContent = analysisMode === 'audit' ? t('codeLabel') : t('taskLabel');
    if (modeTitle) modeTitle.textContent = analysisMode === 'audit' ? t('codeTitle') : t('taskTitle');
    if (!currentResult) setLabel('#auditSummary', t('findingsPlaceholder'));
    else {
      const draftTitle = $('#draftTitle');
      if (draftTitle) draftTitle.textContent = currentResult.analysis_mode === 'audit' ? t('userCode') : t('draftGenerated');
    }
    renderHistory();
    const projectKey = $('#testProjectKey');
    if (projectKey) projectKey.placeholder = locale === 'en' ? 'Example: hand-tracking-demo' : 'Örnek: el-takip-uygulamam';
    const requirements = $('#testRequirements');
    if (requirements) requirements.placeholder = t('requirementsPlaceholder');
    const repo = $('#githubRepo');
    if (repo) repo.placeholder = locale === 'en' ? 'https://github.com/owner/repository' : 'https://github.com/kullanici/depo';
    const githubStatus = $('#githubStatus');
    if (githubStatus && !githubStatus.dataset.state) githubStatus.textContent = t('githubInitial');
    const githubFile = $('#githubFile');
    if (githubFile && !githubFile.value) githubFile.options[0].textContent = t('repoFirstLoad');
    const runMeta = $('#runMeta');
    if (runMeta && !currentResult && !$('#runButton')?.disabled) runMeta.textContent = t('readyStart');
    if (!currentResult) {
      const draftCode = $('#draftCode');
      const finalCode = $('#finalCode');
      const testsCode = $('#testsCode');
      if (draftCode) draftCode.textContent = locale === 'en' ? '# The first draft will appear here' : '# İlk taslak burada görüntülenecek';
      if (finalCode) finalCode.textContent = locale === 'en' ? '# Reviewed final code will appear here' : '# Denetlenmiş final kod burada görüntülenecek';
      if (testsCode) testsCode.textContent = locale === 'en' ? '# Generated tests will appear here' : '# Otomatik testler burada görüntülenecek';
    }
    const meta = $('meta[name="description"]');
    if (meta) meta.content = locale === 'en' ? 'Multi-agent code generation, security review, and refinement cockpit.' : 'Çoklu ajan kod üretim, güvenlik denetimi ve iyileştirme kokpiti.';
    document.title = locale === 'en' ? 'DevArena — Multi-Agent Code Cockpit' : 'DevArena — Çoklu Model Kod Kokpiti';
    $('#localeSelector')?.setAttribute('aria-label', locale === 'en' ? 'Interface language' : 'Arayüz dili');
    $('#themeSelector')?.setAttribute('aria-label', locale === 'en' ? 'Choose color theme' : 'Renk temasını seç');
    $('#language')?.setAttribute('aria-label', t('languagePython'));
    $('#reviewDepth')?.setAttribute('aria-label', locale === 'en' ? 'Review depth' : 'İnceleme hızı');
    $('#githubRepo')?.setAttribute('aria-label', locale === 'en' ? 'Public GitHub repository URL' : 'Herkese açık GitHub depo bağlantısı');
    $('#githubFile')?.setAttribute('aria-label', locale === 'en' ? 'Python file to review' : 'İncelenecek Python dosyası');
    updateReviewDepthNote();
    $$('[data-stage]').forEach((node) => {
      const modelLabel = $('.node-copy small', node);
      if (modelLabel && !node.dataset.model) modelLabel.textContent = t('waitingModel');
    });
    setMode($('#topMode')?.textContent?.includes('LIVE') || $('#topMode')?.textContent?.includes('CANLI') ? 'live' : 'demo');
    if ($('#presetChips') && presets.length) renderPresets();
    try { localStorage.setItem('devarena-locale', locale); } catch (error) { console.warn('Language preference could not be saved:', error); }
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function toast(message) {
    const element = $('#toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    window.setTimeout(() => element.classList.remove('show'), 2200);
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function setAnalysisMode(mode) {
    const nextMode = mode === 'audit' ? 'audit' : 'generate';
    const currentPrompt = $('#prompt');
    if (currentPrompt) modeDrafts[analysisMode] = currentPrompt.value;
    analysisMode = nextMode;
    const generateTab = $('#modeGenerate');
    const auditTab = $('#modeAudit');
    const prompt = $('#prompt');
    const overline = $('#promptOverline');
    const title = $('#promptTitle');
    const presetRow = $('.preset-row');
    const githubImporter = $('#githubImporter');
    generateTab?.classList.toggle('active', analysisMode === 'generate');
    auditTab?.classList.toggle('active', analysisMode === 'audit');
    generateTab?.setAttribute('aria-selected', String(analysisMode === 'generate'));
    auditTab?.setAttribute('aria-selected', String(analysisMode === 'audit'));
    if (prompt) {
      prompt.value = modeDrafts[analysisMode];
      prompt.maxLength = analysisMode === 'audit' ? 60000 : 12000;
      prompt.placeholder = analysisMode === 'audit' ? t('promptAudit') : t('promptGenerate');
    }
    if (overline) overline.textContent = analysisMode === 'audit' ? t('codeLabel') : t('taskLabel');
    if (title) title.textContent = analysisMode === 'audit' ? t('codeTitle') : t('taskTitle');
    if (presetRow) presetRow.hidden = analysisMode === 'audit';
    if (githubImporter) githubImporter.hidden = analysisMode !== 'audit';
  }

  function setGithubStatus(message, state = 'info') {
    const status = $('#githubStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  async function loadGithubFiles() {
    const input = $('#githubRepo');
    const select = $('#githubFile');
    const button = $('#loadGithubFiles');
    const repository = input?.value.trim() || '';
    if (!repository) { setGithubStatus(t('repoEmpty'), 'error'); input?.focus(); return; }
    if (!select || !button) return;
    button.disabled = true;
    select.disabled = true;
    select.innerHTML = `<option value="">${escapeHtml(t('repoLoadingFiles'))}</option>`;
    githubBranch = '';
    githubRepository = '';
    githubSourceReference = null;
    githubImportedContent = '';
    setGithubStatus(t('repoChecking'));
    try {
      const response = await fetch(`/api/github/files?repository=${encodeURIComponent(repository)}`, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `GitHub isteği başarısız (${response.status}).`);
      githubBranch = data.branch;
      githubRepository = data.repository;
      if (!Array.isArray(data.files) || !data.files.length) {
        select.innerHTML = `<option value="">${escapeHtml(t('repoFileMissing'))}</option>`;
        setGithubStatus(t('repoNoFiles'), 'error');
        return;
      }
      select.innerHTML = `<option value="">${escapeHtml(t('repoSelectFile'))}</option>` + data.files.map((file) =>
        `<option value="${escapeHtml(file.path)}">${escapeHtml(file.path)} (${Math.ceil(file.size / 1024)} KB)</option>`
      ).join('');
      select.disabled = false;
      const extra = data.truncated ? t('repoTruncated') : '';
      const foundMessage = locale === 'en'
        ? `${data.files.length} ${t('repoFilesSuffix')} ${data.repository} (${data.branch}).${extra}`
        : `${data.repository} ${t('repoListPrefix')} ${data.branch} ${data.files.length} ${t('repoFilesSuffix')}${extra}`;
      setGithubStatus(foundMessage, 'success');
    } catch (error) {
      select.innerHTML = `<option value="">${escapeHtml(t('repoFilesFailed'))}</option>`;
      setGithubStatus(error.message || 'GitHub deposu okunamadı.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function loadGithubFile() {
    const select = $('#githubFile');
    const path = select?.value || '';
    if (!path || !githubRepository || !githubBranch) return;
    select.disabled = true;
    setGithubStatus(`${path} ${t('repoLoading')}`);
    try {
      const query = new URLSearchParams({ repository: `https://github.com/${githubRepository}`, path, ref: githubBranch });
      const response = await fetch(`/api/github/file?${query}`, { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `Dosya isteği başarısız (${response.status}).`);
      const prompt = $('#prompt');
      if (!prompt) return;
      prompt.value = data.content;
      modeDrafts.audit = data.content;
      githubSourceReference = `${data.repository}@${data.branch}:${data.path}`;
      githubImportedContent = data.content;
      const language = $('#language');
      if (language) language.value = 'Python';
      setGithubStatus(`${data.path} ${t('repoLoaded')}`, 'success');
      prompt.focus();
    } catch (error) {
      setGithubStatus(error.message || t('repoListFailed'), 'error');
    } finally {
      select.disabled = false;
    }
  }

  function setMode(mode) {
    const live = mode === 'live';
    const color = live ? '#a3ffcb' : '#edbe6a';
    const label = live ? t('liveReady') : t('noApi');
    const statusDot = $('#statusDot');
    const topStatusDot = $('#topStatusDot');
    const modeLabel = $('#modeLabel');
    const topMode = $('#topMode');
    if (statusDot) statusDot.style.background = color;
    if (topStatusDot) topStatusDot.style.background = color;
    if (modeLabel) modeLabel.textContent = label;
    if (topMode) topMode.textContent = live ? (locale === 'en' ? 'LIVE API' : 'CANLI API') : (locale === 'en' ? 'NO API' : 'BAĞLANTI YOK');
  }

  function applyTheme(theme) {
    const allowed = ['dark', 'light', 'pink'];
    const selected = allowed.includes(theme) ? theme : 'dark';
    document.documentElement.dataset.theme = selected;
    const themeColors = { dark: '#080a0f', light: '#f2f5f9', pink: '#fff1f6' };
    const themeColor = $('meta[name="theme-color"]');
    if (themeColor) themeColor.content = themeColors[selected];
    const selector = $('#themeSelector');
    if (selector) selector.value = selected;
    try { localStorage.setItem('devarena-theme', selected); } catch (error) { console.warn('Tema tercihi kaydedilemedi:', error); }
  }

  function readTheme() {
    try { return localStorage.getItem('devarena-theme') || 'dark'; } catch { return 'dark'; }
  }

  function elapsedLabel(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function stopStageTimer() {
    if (stageTimer) window.clearInterval(stageTimer);
    stageTimer = null;
  }

  function stageLabel(id) {
    return ({ routing: t('routing'), generating: t('generating'), critiquing: t('critiquing'), refining: t('refining') })[id] || t('stageRunning');
  }

  function updateReviewDepthNote() {
    const note = $('#reviewDepthNote');
    const depth = $('#reviewDepth')?.value || 'fast';
    if (note) note.textContent = t(depth === 'deep' ? 'deepNote' : 'fastNote');
  }

  function renderHistory() {
    const list = $('#historyList');
    const count = $('#historyCount');
    if (count) count.textContent = String(history.length);
    if (!list) return;
    if (!history.length) {
      list.innerHTML = `<div class="empty-history">${escapeHtml(t('noHistory'))}</div>`;
      return;
    }
    list.innerHTML = history.slice(0, 8).map((item, index) => {
      const prompt = item && typeof item.prompt === 'string' ? item.prompt : 'Analiz oturumu';
      return `<button class="history-item" type="button" data-history="${index}" title="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`;
    }).join('');
    $$('[data-history]', list).forEach((element) => {
      element.addEventListener('click', () => {
        const item = history[Number(element.dataset.history)];
        if (item) showResult(item);
      });
    });
  }

  async function loadHealth() {
    try {
      const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Health endpoint ${response.status}`);
      const health = await response.json();
      setMode(health.status === 'ok' && health.api_key_configured ? 'live' : 'demo');
    } catch (error) {
      setMode('demo');
      console.warn('DevArena health check failed:', error);
    }
  }

  function renderPresets() {
    const chips = $('#presetChips');
    if (!chips) return;
    chips.innerHTML = presets.map((preset) => {
      const title = String(localizedPreset(preset, 'title') || (locale === 'en' ? 'Sample scenario' : 'Hazır senaryo'));
      const subtitle = String(localizedPreset(preset, 'subtitle') || title);
      const label = title.split(/\s+/).slice(0, 3).join(' ');
      return `<button class="chip" type="button" data-preset="${escapeHtml(preset.id)}" title="${escapeHtml(subtitle)}">${escapeHtml(label)}</button>`;
    }).join('');
    $$('[data-preset]', chips).forEach((button) => {
      button.addEventListener('click', () => {
        const preset = presets.find((item) => String(item.id) === button.dataset.preset);
        if (!preset) return;
        const targetMode = preset.analysis_mode === 'audit' && preset.code ? 'audit' : 'generate';
        if (analysisMode !== targetMode) setAnalysisMode(targetMode);
        const prompt = $('#prompt');
        const language = $('#language');
        if (prompt) {
          prompt.value = targetMode === 'audit' ? preset.code : preset.prompt || '';
          modeDrafts[targetMode] = prompt.value;
        }
        if (language && preset.language) language.value = preset.language;
        if (targetMode === 'audit') {
          githubSourceReference = null;
          githubImportedContent = '';
          setGithubStatus(`${t('localScenarioLoaded')}: ${localizedPreset(preset, 'title')}`);
        }
        $$('.chip', chips).forEach((chip) => chip.classList.toggle('selected', chip === button));
      });
    });
  }

  async function loadPresets() {
    const chips = $('#presetChips');
    try {
      const response = await fetch('/api/presets', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Presets endpoint ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new TypeError('Preset response must be an array');
      presets = data;
      renderPresets();
    } catch (error) {
      if (chips) chips.innerHTML = `<span class="preset-error">${escapeHtml(t('loadScenariosFailed'))}</span>`;
      console.warn('DevArena presets failed:', error);
    }
  }

  function resetPipeline() {
    stopStageTimer();
    $$('.pipe-node').forEach((node) => {
      node.classList.remove('done', 'running', 'skipped', 'failed');
      const meta = $('.node-meta', node);
    if (meta) meta.textContent = '—';
    });
    $$('.pipe-connector').forEach((connector) => connector.classList.remove('done'));
  }

  function markStage(stage) {
    const node = $(`[data-stage="${stage.id}"]`);
    if (!node) return;
    const modelLabel = $('.node-copy small', node);
    if (modelLabel && stage.model) modelLabel.textContent = stage.model;
    if (stage.model) { node.dataset.model = stage.model; node.title = stage.model; }
    if (stage.status === 'running') {
      stopStageTimer();
      node.classList.remove('done', 'skipped');
      node.classList.add('running');
      const meta = $('.node-meta', node);
      if (meta) meta.textContent = locale === 'en' ? 'Running' : 'Çalışıyor';
      activeStageStartedAt = Date.now();
      const runMeta = $('#runMeta');
      const updateClock = () => {
        if (runMeta) runMeta.textContent = `${stageLabel(stage.id)} · ${elapsedLabel(Date.now() - activeStageStartedAt)}`;
      };
      updateClock();
      stageTimer = window.setInterval(updateClock, 1000);
      return;
    }
    stopStageTimer();
    node.classList.toggle('skipped', stage.status === 'skipped');
    node.classList.toggle('done', stage.status !== 'skipped');
    node.classList.remove('running');
    const meta = $('.node-meta', node);
    if (meta) meta.textContent = stage.status === 'skipped' ? (locale === 'en' ? 'Skipped' : 'Atlandı') : `${stage.elapsed_ms || 0} ms`;
    const stageIndex = stageIds.indexOf(stage.id);
    if (stageIndex >= 0 && stageIndex < stageIds.length - 1) {
      const connector = $$('.pipe-connector')[stageIndex];
      if (connector) connector.classList.add('done');
      const next = $(`[data-stage="${stageIds[stageIndex + 1]}"]`);
      if (next) next.classList.add('running');
    }
  }

  function languageClass(language) {
    return ({ Python: 'python', TypeScript: 'typescript', Go: 'go', SQL: 'sql' })[language] || 'python';
  }

  function showResult(result) {
    if (!result || typeof result !== 'object') return;
    currentResult = result;
    const resultsSection = $('#resultsSection');
    if (resultsSection) resultsSection.classList.add('has-result');
    const errorBox = $('#analysisError');
    if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
    const setText = (selector, value) => { const element = $(selector); if (element) element.textContent = value; };
    setText('#initialScore', `${result.initial_score ?? '—'}/100`);
    setText('#finalScore', `${result.final_score ?? '—'}/100`);
    setText('#findingTabCount', String((result.findings || []).length));
    const criticSummary = (result.stages || []).find((stage) => stage.id === 'critiquing')?.output?.summary;
    setText('#auditSummary', criticSummary || result.routing?.rationale || t('analysisComplete'));
    const findingsList = $('#findingsList');
    if (findingsList) {
      findingsList.innerHTML = (result.findings || []).map((finding) => `
        <article class="finding">
          <span class="severity ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
          <div><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.description)}</p></div>
          <span class="finding-meta">${escapeHtml(t('lineLabel'))} ${escapeHtml(finding.line)} · ${escapeHtml(finding.category)}</span>
        </article>`).join('') || `<div class="audit-summary">${escapeHtml(t('noFindings'))}</div>`;
    }
    const codeClass = `language-${languageClass(result.language)}`;
    ['draftCode', 'finalCode', 'testsCode'].forEach((id, index) => {
      const code = $(`#${id}`);
      if (!code) return;
      code.className = codeClass;
      code.textContent = [result.draft_code, result.final_code, result.tests][index] || '';
    });
    const extension = ({ Python: 'py', TypeScript: 'ts', Go: 'go', SQL: 'sql' })[result.language] || 'txt';
    setText('#draftExt', extension);
    setText('#finalExt', extension);
    setText('#testExt', extension);
    setText('#draftTitle', result.analysis_mode === 'audit' ? t('userCode') : t('draftGenerated'));
    if (window.Prism && resultsSection) window.Prism.highlightAllUnder(resultsSection);
    refreshIcons();
    resultsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function startAnalysis() {
    const promptElement = $('#prompt');
    const languageElement = $('#language');
    const reviewDepth = $('#reviewDepth')?.value || 'fast';
    const button = $('#runButton');
    const prompt = promptElement?.value.trim() || '';
    const language = languageElement?.value || 'Python';
    if (prompt.length < 8) {
      toast(t('minPrompt'));
      promptElement?.focus();
      return;
    }
    if (!button) return;
    button.disabled = true;
    const buttonLabel = $('span', button);
    if (buttonLabel) buttonLabel.textContent = t('analysing');
    const runMeta = $('#runMeta');
    if (runMeta) runMeta.textContent = t('starting');
    const errorBox = $('#analysisError');
    if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
    $('#resultsSection')?.classList.add('has-result');
    resetPipeline();
    $('[data-stage="routing"]')?.classList.add('running');
    $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === 'audit'));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'panel-audit'));
    let completed = false;
    try {
      const requestBody = analysisMode === 'audit'
        ? { analysis_mode: 'audit', review_depth: reviewDepth, response_language: locale, prompt: locale === 'en' ? 'Review the supplied existing code for security vulnerabilities, bugs, edge cases, and performance. Preserve its intent and produce hardened final code plus pytest tests.' : 'Mevcut kodu güvenlik açıkları, hatalar, uç durumlar ve performans açısından incele. Amacını koru ve güvenli final kod ile pytest testleri üret.', code: prompt, language, source_reference: githubSourceReference }
        : { analysis_mode: 'generate', review_depth: reviewDepth, response_language: locale, prompt, language };
      const response = await fetch('/api/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok || !response.body) throw new Error(`${t('analysisRequestFailed')} (${response.status}).`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let delimiter;
        while ((delimiter = buffer.indexOf('\n\n')) >= 0) {
          const rawEvent = buffer.slice(0, delimiter);
          buffer = buffer.slice(delimiter + 2);
          const eventName = rawEvent.match(/^event:\s*(\w+)/m)?.[1];
          const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(5).trim());
          if (eventName === 'mode') setMode(payload.mode);
          if (eventName === 'fallback') {
            setMode('demo');
            toast(t('noApi'));
          }
          if (eventName === 'stage') markStage(payload);
          if (eventName === 'error') {
            const message = payload.message || t('analysisFailed');
            if (errorBox) { errorBox.textContent = `${t('analysisFailed')}: ${message}`; errorBox.hidden = false; }
            throw new Error(message);
          }
          if (eventName === 'completed') {
            completed = true;
            stopStageTimer();
            setMode(payload.mode);
            showResult(payload);
            const totalTokens = (payload.stages || []).reduce((sum, stage) => sum + (stage.tokens || 0), 0);
            if (runMeta) runMeta.textContent = `${payload.elapsed_ms || 0} ms · ${totalTokens.toLocaleString()} ${t('estimatedTokens')}`;
            history.unshift(payload);
            history = history.slice(0, 30);
            try { localStorage.setItem('devarena-history', JSON.stringify(history)); } catch (error) { console.warn('Could not save local history:', error); }
            renderHistory();
            const vulnCount = $('#vulnCount');
            if (vulnCount) vulnCount.textContent = String(history.reduce((sum, item) => sum + (item.findings?.length || 0), 0));
            const gains = history.map((item) => (item.final_score || 0) - (item.initial_score || 0));
            const scoreGain = $('#scoreGain');
            if (scoreGain) scoreGain.textContent = gains.length ? `+${Math.round(gains.reduce((sum, gain) => sum + gain, 0) / gains.length)}` : '—';
          }
        }
      }
      if (!completed) throw new Error(t('streamClosed'));
    } catch (error) {
      toast(error.message || t('analysisRequestFailed'));
      stopStageTimer();
      $$('.pipe-node.running').forEach((node) => {
        node.classList.remove('running');
        node.classList.add('failed');
        const meta = $('.node-meta', node);
        if (meta) meta.textContent = locale === 'en' ? 'No response' : 'Yanıt alınamadı';
      });
      if (runMeta) runMeta.textContent = t('analysisFailed');
      if (errorBox && error.message) { errorBox.textContent = `${t('analysisFailed')}: ${error.message}`; errorBox.hidden = false; }
      console.error('DevArena analysis failed:', error);
    } finally {
      button.disabled = false;
      if (buttonLabel) buttonLabel.textContent = t('runAnalysis');
    }
  }

  async function runPythonTests() {
    const button = $('#runTestsButton');
    const output = $('#testOutput');
    const status = $('#testRunStatus');
    const terminal = $('.terminal-card');
    if (!currentResult?.final_code || !currentResult?.tests) {
      toast(t('noAnalysis'));
      return;
    }
    if (currentResult.language !== 'Python') {
      toast(t('pythonOnly'));
      return;
    }
    if (!button || !output) return;
    button.disabled = true;
    if (status) status.textContent = locale === 'en' ? 'Running…' : 'Çalışıyor…';
    if (terminal) terminal.dataset.status = 'running';
    output.textContent = t('preparingTests');
    try {
      const response = await fetch('/api/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          final_code: currentResult.final_code,
          unit_tests: currentResult.tests,
          requirements_txt: $('#testRequirements')?.value || '',
          project_key: $('#testProjectKey')?.value.trim() || currentResult.source_reference || 'local-project',
          profile: $('#testProfile')?.value || 'auto',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || `Test runner HTTP ${response.status}`);
      output.textContent = result.output || (locale === 'en' ? 'The test runner produced no output.' : 'Test runner çıktı üretmedi.');
      if (status) status.textContent = result.phase === 'dependencies' ? t('dependencyError') : result.timed_out ? t('testTimeout') : result.passed ? t('passed') : t('failed');
      if (result.requirements?.length) {
        const profileLabels = locale === 'en'
          ? { basic: 'Basic', vision: 'Vision', desktop: 'Desktop', data: 'Data science', web: 'API', custom: 'Custom', auto: 'Auto' }
          : { basic: 'Temel', vision: 'Görüntü işleme', desktop: 'Masaüstü', data: 'Veri bilimi', web: 'API', custom: 'Özel', auto: 'Otomatik' };
        output.textContent = `${locale === 'en' ? 'Package profile' : 'Paket grubu'}: ${profileLabels[result.profile] || result.profile || 'Otomatik'}\n${locale === 'en' ? 'Isolated project environment' : 'İzole proje ortamı'}: ${result.requirements.join(', ')}\n\n${output.textContent}`;
      }
      if (terminal) terminal.dataset.status = result.passed ? 'passed' : 'failed';
      toast(result.passed ? t('testSuccessToast') : t('testFailureToast'));
    } catch (error) {
      output.textContent = error.message || 'Test runner isteği başarısız oldu.';
      if (status) status.textContent = locale === 'en' ? 'Error' : 'Hata';
      if (terminal) terminal.dataset.status = 'failed';
      toast(locale === 'en' ? 'Could not run tests.' : 'Testler çalıştırılamadı.');
    } finally {
      button.disabled = false;
    }
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value || '');
      toast(t('copied'));
    } catch {
      toast(t('copyFailed'));
    }
  }

  function loadOptionalScript(source) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => { script.remove(); resolve(false); };
      document.head.appendChild(script);
    });
  }

  async function loadEnhancements() {
    const lucideLoaded = await loadOptionalScript('https://unpkg.com/lucide@latest');
    if (lucideLoaded) refreshIcons();
    const prismLoaded = await loadOptionalScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js');
    if (!prismLoaded) return;
    const prismTheme = document.createElement('link');
    prismTheme.rel = 'stylesheet';
    prismTheme.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
    document.head.appendChild(prismTheme);
    const languages = ['python', 'typescript', 'go', 'sql'];
    for (const language of languages) {
      await loadOptionalScript(`https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${language}.min.js`);
    }
    if (window.Prism && $('#resultsSection')) window.Prism.highlightAllUnder($('#resultsSection'));
  }

  function initialize() {
    applyTheme(readTheme());
    applyLocale(readLocale());
    updateReviewDepthNote();
    renderHistory();
    void loadHealth();
    void loadPresets();
    void loadEnhancements();

    $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
      $$('.tab').forEach((item) => item.classList.toggle('active', item === tab));
      $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${tab.dataset.tab}`));
      if (window.Prism && $('#resultsSection')) window.Prism.highlightAllUnder($('#resultsSection'));
    }));
    $('#runButton')?.addEventListener('click', startAnalysis);
    $('#modeGenerate')?.addEventListener('click', () => setAnalysisMode('generate'));
    $('#modeAudit')?.addEventListener('click', () => setAnalysisMode('audit'));
    $('#themeSelector')?.addEventListener('change', (event) => applyTheme(event.currentTarget.value));
    $('#localeSelector')?.addEventListener('change', (event) => applyLocale(event.currentTarget.value));
    $('#reviewDepth')?.addEventListener('change', updateReviewDepthNote);
    $('#loadGithubFiles')?.addEventListener('click', loadGithubFiles);
    $('#githubRepo')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void loadGithubFiles(); } });
    $('#githubFile')?.addEventListener('change', loadGithubFile);
    $('#prompt')?.addEventListener('input', (event) => {
      modeDrafts[analysisMode] = event.currentTarget.value;
      if (analysisMode === 'audit' && githubSourceReference && event.currentTarget.value !== githubImportedContent) {
        githubSourceReference = null;
        githubImportedContent = '';
        setGithubStatus(t('repoEdited'));
      }
    });
    $('#newAnalysis')?.addEventListener('click', () => {
      const prompt = $('#prompt');
      if (prompt) { prompt.value = ''; modeDrafts[analysisMode] = ''; prompt.focus(); }
      if (analysisMode === 'audit') { githubSourceReference = null; githubImportedContent = ''; }
      resetPipeline();
      toast(t('newReady'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#copyFinal')?.addEventListener('click', () => copyText(currentResult?.final_code || ''));
    $('#copyTests')?.addEventListener('click', () => copyText(currentResult?.tests || ''));
    $('#runTestsButton')?.addEventListener('click', runPythonTests);
    $('#downloadFinal')?.addEventListener('click', () => {
      if (!currentResult) { toast('Önce bir analiz çalıştır.'); return; }
      const extension = ({ Python: 'py', TypeScript: 'ts', Go: 'go', SQL: 'sql' })[currentResult.language] || 'txt';
      const url = URL.createObjectURL(new Blob([currentResult.final_code || ''], { type: 'text/plain' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `devarena-final.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    });
    $('#settingsBtn')?.addEventListener('click', () => toast($('#modeLabel')?.textContent || 'Durum bilgisi yok'));
    setAnalysisMode('generate');
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'enter') void startAnalysis();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        const prompt = $('#prompt');
        if (prompt) { prompt.value = ''; prompt.focus(); }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initialize, { once: true });
})();
