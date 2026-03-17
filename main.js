/* ================================================
   ADAM NAEMAN — PORTFOLIO MAIN ENTRY POINT
   ================================================ */

// ---- Profile Data ----
let profileData = null;

// ---- Language colors for GitHub ----
const LANG_COLORS = {
  Python: '#3572A5',
  JavaScript: '#f1e05a',
  Java: '#b07219',
  'Jupyter Notebook': '#DA5B0B',
  PHP: '#4F5D95',
  Blade: '#f7523f',
  HTML: '#e34c26',
  CSS: '#563d7c',
  TypeScript: '#2b7489',
  null: '#8b8fa8',
};

// ---- Initialize ----
async function init() {
  await loadProfileData();
  initNavigation();
  initThemeToggle();
  initTypingEffect();
  initParticles();
  initScrollAnimations();
  initCounterAnimations();
  renderSkills();
  renderEducation();
  renderExperience();
  renderCertifications();
  renderResumes();
  fetchGitHubRepos();
  registerServiceWorker();
  initOfflineDetection();
}

// ---- Load Profile Data ----
async function loadProfileData() {
  try {
    const response = await fetch('./data/profile.json');
    profileData = await response.json();
  } catch (err) {
    console.warn('Could not load profile data, using defaults.');
    profileData = getDefaultProfile();
  }
}

function getDefaultProfile() {
  return {
    name: 'Adam Naeman',
    title: 'Computer Science Student | AI & ML Enthusiast',
    subtitle_roles: ['AI / ML Developer', 'NLP Researcher', 'Full-Stack Developer'],
    github: 'adamnaemman',
    skills: { languages: [], frameworks: [], ai_ml: [], tools: [], concepts: [] },
    education: [],
    certifications: [],
    resumes: [],
  };
}

// ---- Navigation ----
function initNavigation() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('nav-links');
  const links = navLinks.querySelectorAll('.nav__link');

  // Scroll-based nav background
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('nav--scrolled', window.scrollY > 60);
    updateActiveNavLink();
  });

  // Hamburger toggle
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('nav__hamburger--active');
    navLinks.classList.toggle('nav__links--open');
  });

  // Close mobile menu on link click
  links.forEach((link) => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('nav__hamburger--active');
      navLinks.classList.remove('nav__links--open');
    });
  });
}

function updateActiveNavLink() {
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('.nav__link');
  let currentSection = '';

  sections.forEach((section) => {
    const sectionTop = section.offsetTop - 100;
    if (window.scrollY >= sectionTop) {
      currentSection = section.getAttribute('id');
    }
  });

  navLinks.forEach((link) => {
    link.classList.toggle(
      'nav__link--active',
      link.getAttribute('href') === `#${currentSection}`
    );
  });
}

// ---- Theme Toggle ----
function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('theme');

  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }

  toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });
}

// ---- Typing Effect ----
function initTypingEffect() {
  const roles = profileData?.subtitle_roles || [
    'AI / ML Developer',
    'NLP Researcher',
    'Full-Stack Developer',
  ];
  const typedEl = document.getElementById('typed-text');
  let roleIndex = 0;
  let charIndex = 0;
  let isDeleting = false;

  function type() {
    const currentRole = roles[roleIndex];

    if (!isDeleting) {
      typedEl.textContent = currentRole.substring(0, charIndex + 1);
      charIndex++;

      if (charIndex === currentRole.length) {
        isDeleting = true;
        setTimeout(type, 2000); // Pause before deleting
        return;
      }
      setTimeout(type, 80);
    } else {
      typedEl.textContent = currentRole.substring(0, charIndex - 1);
      charIndex--;

      if (charIndex === 0) {
        isDeleting = false;
        roleIndex = (roleIndex + 1) % roles.length;
        setTimeout(type, 400);
        return;
      }
      setTimeout(type, 40);
    }
  }

  type();
}

// ---- Particles ----
function initParticles() {
  const container = document.getElementById('particles');
  const count = 25;

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'hero__particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${60 + Math.random() * 40}%`;
    particle.style.animationDelay = `${Math.random() * 6}s`;
    particle.style.animationDuration = `${4 + Math.random() * 4}s`;
    const size = 2 + Math.random() * 4;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;

    // Random accent colors
    const colors = ['#00d4ff', '#7c3aed', '#f472b6', '#22c55e'];
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];

    container.appendChild(particle);
  }
}

// ---- Scroll Animations (Intersection Observer) ----
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-on-scroll--visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.animate-on-scroll').forEach((el) => observer.observe(el));
}

// ---- Counter Animation ----
function initCounterAnimations() {
  const counters = document.querySelectorAll('.about__stat-number[data-target]');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((counter) => observer.observe(counter));
}

function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-target'));
  const duration = 1500;
  const start = Date.now();

  function update() {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(target * eased);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// ---- Render Skills ----
function renderSkills() {
  const grid = document.getElementById('skills-grid');
  if (!profileData?.skills) return;

  const categories = {
    languages: { label: 'Languages', icon: '💻' },
    frameworks: { label: 'Frameworks & Libraries', icon: '⚡' },
    ai_ml: { label: 'AI / ML', icon: '🧠' },
    tools: { label: 'Tools & Platforms', icon: '🛠️' },
    concepts: { label: 'Concepts', icon: '📐' },
  };

  grid.innerHTML = Object.entries(categories)
    .filter(([key]) => profileData.skills[key]?.length > 0)
    .map(
      ([key, { label }]) => `
    <div class="skill-category animate-on-scroll">
      <h3 class="skill-category__title">${label}</h3>
      <div class="skill-tags">
        ${profileData.skills[key].map((s) => `<span class="skill-tag">${s}</span>`).join('')}
      </div>
    </div>
  `
    )
    .join('');

  // Re-observe new elements
  initScrollAnimations();
}

// ---- Render Education ----
function renderEducation() {
  const timeline = document.getElementById('education-timeline');
  if (!profileData?.education?.length) return;

  timeline.innerHTML = profileData.education
    .map(
      (edu) => `
    <div class="timeline__item animate-on-scroll">
      <span class="timeline__period">${edu.period}</span>
      <h3 class="timeline__degree">${edu.degree}</h3>
      <p class="timeline__institution">${edu.institution}</p>
      ${edu.grade ? `<p class="timeline__grade">📊 ${edu.grade}</p>` : ''}
      ${
        edu.highlights?.length
          ? `<div class="timeline__highlights">
        ${edu.highlights.map((h) => `<span class="timeline__highlight-tag">${h}</span>`).join('')}
      </div>`
          : ''
      }
    </div>
  `
    )
    .join('');

  initScrollAnimations();
}

// ---- Render Experience ----
function renderExperience() {
  const timeline = document.getElementById('experience-timeline');
  const emptyMsg = document.getElementById('experience-empty');
  if (!profileData?.experience?.length) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';

  timeline.innerHTML = profileData.experience
    .map(
      (exp) => `
    <div class="timeline__item animate-on-scroll">
      <span class="timeline__period">${exp.period}</span>
      <h3 class="timeline__degree">${exp.title}</h3>
      <p class="timeline__institution">${exp.company}${exp.location ? ` · ${exp.location}` : ''}</p>
      ${exp.description ? `<p class="about__text" style="font-size: 0.9rem; margin-top: 12px;">${exp.description}</p>` : ''}
    </div>
  `
    )
    .join('');

  initScrollAnimations();
}

// ---- Render Certifications ----
function renderCertifications() {
  const grid = document.getElementById('certs-grid');
  if (!profileData?.certifications?.length) return;

  const iconMap = {
    award: '🏆',
    code: '📜',
    default: '🎖️',
  };

  grid.innerHTML = profileData.certifications
    .map(
      (cert) => `
    <div class="cert-card animate-on-scroll">
      <div class="cert-card__icon">${iconMap[cert.icon] || iconMap.default}</div>
      <div class="cert-card__content">
        <h3 class="cert-card__name">${cert.name}</h3>
        <p class="cert-card__issuer">${cert.issuer}</p>
        <span class="cert-card__date">Issued ${cert.date}</span>
      </div>
    </div>
  `
    )
    .join('');

  initScrollAnimations();
}

// ---- Render Resumes ----
function renderResumes() {
  const grid = document.getElementById('resumes-grid');
  if (!profileData?.resumes?.length) {
    grid.innerHTML = `
      <div class="resume-card" style="cursor: default; opacity: 0.7;">
        <div class="resume-card__icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="resume-card__content">
          <p class="resume-card__label">Resume coming soon</p>
          <p class="resume-card__desc">Check back later!</p>
        </div>
      </div>
    `;
    return;
  }

  grid.innerHTML = profileData.resumes
    .map(
      (resume) => `
    <a href="./resumes/${resume.filename}" download class="resume-card animate-on-scroll">
      <div class="resume-card__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      </div>
      <div class="resume-card__content">
        <p class="resume-card__label">${resume.label}</p>
        <p class="resume-card__desc">${resume.description}</p>
        <span class="resume-card__download">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PDF
        </span>
      </div>
    </a>
  `
    )
    .join('');

  initScrollAnimations();
}

// ---- GitHub Integration ----
async function fetchGitHubRepos() {
  const grid = document.getElementById('projects-grid');
  const loading = document.getElementById('projects-loading');
  const username = profileData?.github || 'adamnaemman';
  const cacheKey = `github_repos_${username}`;

  try {
    // Try cache first
    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(`${cacheKey}_time`);
    const cacheValid = cacheTime && Date.now() - parseInt(cacheTime) < 3600000; // 1 hour

    let repos;

    if (cached && cacheValid) {
      repos = JSON.parse(cached);
    } else {
      const response = await fetch(
        `https://api.github.com/users/${username}/repos?sort=updated&per_page=10`
      );

      if (!response.ok) throw new Error('GitHub API error');

      repos = await response.json();

      // Cache the response
      localStorage.setItem(cacheKey, JSON.stringify(repos));
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    }

    renderProjects(repos);
  } catch (err) {
    console.warn('GitHub API failed, trying cache...', err);

    // Try stale cache
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      renderProjects(JSON.parse(cached));
    } else {
      loading.innerHTML = `
        <p style="color: var(--text-muted);">Unable to load GitHub repos. <a href="https://github.com/${username}" target="_blank" style="color: var(--accent-primary);">View on GitHub →</a></p>
      `;
    }
  }
}

function renderProjects(repos) {
  const grid = document.getElementById('projects-grid');

  // Filter out forks and empty repos; keep the interesting ones
  const filteredRepos = repos
    .filter((r) => !r.fork)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

  if (filteredRepos.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No projects yet — stay tuned!</p>';
    return;
  }

  grid.innerHTML = filteredRepos
    .map(
      (repo) => `
    <a href="${repo.html_url}" target="_blank" rel="noopener" class="project-card animate-on-scroll">
      <div class="project-card__header">
        <svg class="project-card__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <div class="project-card__links">
          <span class="project-card__link" title="View on GitHub">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </span>
        </div>
      </div>
      <h3 class="project-card__name">${formatRepoName(repo.name)}</h3>
      <p class="project-card__desc">${repo.description || 'No description yet — check the repository for details.'}</p>
      <div class="project-card__footer">
        <div class="project-card__lang">
          ${
            repo.language
              ? `<span class="project-card__lang-dot" style="background: ${LANG_COLORS[repo.language] || '#8b8fa8'}"></span>
            <span>${repo.language}</span>`
              : ''
          }
        </div>
        <div class="project-card__meta">
          <span class="project-card__meta-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            ${repo.stargazers_count}
          </span>
          <span class="project-card__meta-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
            ${repo.forks_count}
          </span>
        </div>
      </div>
    </a>
  `
    )
    .join('');

  initScrollAnimations();
}

function formatRepoName(name) {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Service Worker Registration ----
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log('Service Worker registered');
    } catch (err) {
      console.warn('Service Worker registration failed:', err);
    }
  }
}

// ---- Offline Detection ----
function initOfflineDetection() {
  const banner = document.getElementById('offline-banner');

  function updateOnlineStatus() {
    banner.classList.toggle('offline-banner--visible', !navigator.onLine);
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
