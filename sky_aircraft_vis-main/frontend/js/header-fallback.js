// Inject a small header button group when the page header buttons are missing
(function(){
  try{
    const have = document.querySelector('.header-buttons');
    if (have) return;

    const header = document.querySelector('header');
    const target = header ? (header.querySelector('.right') || header) : document.body;

    const wrap = document.createElement('div');
    wrap.className = 'header-buttons';
    wrap.style.marginRight = '12px';

    const makeBtn = (href, cls, html)=>{
      const a = document.createElement('a');
      a.href = href; a.className = 'header-btn'; a.innerHTML = html; return a;
    };

    const btns = [
      makeBtn('/aviation-dashboard.html', 'dash', '<i class="fa-solid fa-chart-pie"></i> Vue d\'ensemble'),
      makeBtn('/scrapping/index.html', 'live', '<i class="fa-solid fa-plane"></i> Vols en temps réel'),
      makeBtn('/aviation-historical.html', 'hist', '<i class="fa-solid fa-clock"></i> Historique')
    ];
    btns.forEach(b=>wrap.appendChild(b));

    // mark active based on pathname
    const p = location.pathname || '';
    if (p.includes('aviation-historical')) btns[2].classList.add('active');
    else if (p.includes('/scrapping/') || p.endsWith('/index.html')) btns[1].classList.add('active');
    else btns[0].classList.add('active');

    // append to header right area or top of body
    if (target) target.insertBefore(wrap, target.firstChild);
  }catch(e){ console.error('header-fallback error', e); }
})();
