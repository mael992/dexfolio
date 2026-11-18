// Applique le thème avant le premier rendu pour éviter le flash clair/sombre.
;(function () {
  var dark = false
  try {
    var t = localStorage.getItem('dexfolio:theme')
    dark = t === 'dark' || ((!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  } catch (e) {
    /* stockage indisponible : thème clair */
  }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
})()
