// 작법 노트 오프라인 도우미(서비스 워커).
// 한 번 연 화면·글꼴·사전 분석기 파일을 기기에 담아 두어, 인터넷이 끊겨도 앱이 열리게 한다.
// 원고는 원래 기기 안(IndexedDB)에 있으므로 여기서 다루지 않는다.
// 국어사전·AI(/api/...)와 클라우드 동기화(다른 주소)는 항상 인터넷으로만 간다.
const CACHE = 'jakbeop-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 화면(페이지)은 인터넷 먼저, 안 되면 담아 둔 것
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

// 이름에 버전이 붙은 파일(/assets/)은 한 번 받으면 바뀌지 않으니 담아 둔 것 먼저
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

// 그 밖의 파일은 담아 둔 것을 바로 쓰고, 뒤에서 새것으로 바꿔 둔다
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || update;
}

// 앱이 놓인 자리 (깃허브 페이지처럼 /jakbeop-note/ 아래에 있어도 맞게)
const ROOT = new URL(self.registration.scope).pathname;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 다른 주소(동기화 서버, 듣기 링크 등)는 건드리지 않는다
  if (url.pathname.startsWith(ROOT + 'api/')) return; // 사전·AI 중계는 항상 실시간
  if (request.headers.has('range')) return; // 큰 파일의 부분 요청은 그대로
  if (request.mode === 'navigate') return event.respondWith(networkFirst(request));
  if (url.pathname.startsWith(ROOT + 'assets/')) return event.respondWith(cacheFirst(request));
  event.respondWith(staleWhileRevalidate(request));
});
