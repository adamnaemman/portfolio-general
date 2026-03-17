/**
 * LinkedIn → Profile.json Auto-Sync Script (Puppeteer Edition)
 * 
 * Uses headless Chrome to log in with your li_at cookie and natively
 * intercepts the Voyager API JSON payloads directly from the Network tab.
 * This completely bypasses LinkedIn's aggressive bot/CSRF protections.
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '..', 'public', 'data', 'profile.json');
const LINKEDIN_VANITY = 'adam-naeman';
const PROFILE_URL = `https://www.linkedin.com/in/${LINKEDIN_VANITY}/`;

// ---- Extract Data from any schema version ----
function extractProfileData(parts) {
  let education = [];
  let certifications = [];
  let skills = [];
  let experience = [];
  
  // Combine all intercepted parts
  for (const raw of parts) {
    const included = raw.included || [];
    
    // Extract education
    const eduItems = included
      .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Education')
      .map((edu) => ({
        institution: edu.schoolName || '',
        degree: [edu.degreeName, edu.fieldOfStudy].filter(Boolean).join(', '),
        period: formatDateRange(edu.timePeriod),
        grade: edu.grade || '',
        highlights: edu.activities ? [edu.activities] : [],
      }));
    if (eduItems.length > 0) education.push(...eduItems);

    // Extract certifications
    const certItems = included
      .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Certification')
      .map((cert) => ({
        name: cert.name || '',
        issuer: cert.authority || '',
        date: formatDate(cert.timePeriod?.startDate),
        icon: 'award',
      }));
    if (certItems.length > 0) certifications.push(...certItems);

    // Extract skills
    const skillItems = included
      .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Skill')
      .map((s) => s.name)
      .filter(Boolean);
    if (skillItems.length > 0) skills.push(...skillItems);

    // Extract experience/positions
    const expItems = included
      .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Position')
      .map((pos) => ({
        title: pos.title || '',
        company: pos.companyName || '',
        period: formatDateRange(pos.timePeriod),
        description: pos.description || '',
        location: pos.locationName || '',
      }));
    if (expItems.length > 0) experience.push(...expItems);
  }

  // Deduplicate
  skills = [...new Set(skills)];

  return {
    education: education.length > 0 ? education : undefined,
    certifications: certifications.length > 0 ? certifications : undefined,
    linkedin_skills: skills.length > 0 ? skills : undefined,
    experience: experience.length > 0 ? experience : undefined,
    last_synced: new Date().toISOString(),
  };
}

// ---- Date Helpers ----
function formatDate(dateObj) {
  if (!dateObj) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = dateObj.month ? months[dateObj.month - 1] : '';
  return [month, dateObj.year].filter(Boolean).join(' ');
}

function formatDateRange(timePeriod) {
  if (!timePeriod) return '';
  const start = formatDate(timePeriod.startDate);
  const end = timePeriod.endDate ? formatDate(timePeriod.endDate) : 'Present';
  return `${start} — ${end}`;
}

// ---- Merge with Existing Profile ----
function mergeProfile(existing, linkedInData) {
  const merged = { ...existing };

  if (linkedInData.education) merged.education = linkedInData.education;
  if (linkedInData.certifications) merged.certifications = linkedInData.certifications;
  if (linkedInData.linkedin_skills) merged.linkedin_skills = linkedInData.linkedin_skills;
  if (linkedInData.experience) merged.experience = linkedInData.experience;

  merged.last_synced = linkedInData.last_synced;
  return merged;
}

// ---- Main ----
async function main() {
  let cookie = process.env.LINKEDIN_COOKIE;

  if (!cookie) {
    console.error('❌ Missing LINKEDIN_COOKIE environment variable.');
    process.exit(1);
  }
  
  cookie = cookie.replace(/^"|"$/g, '').trim();

  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
    console.log('📂 Loaded existing profile.json');
  } catch {
    console.log('📂 No existing profile.json found');
  }

  console.log('🚀 Launching headless browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set custom user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Inject the li_at cookie
    await page.setCookie({
      name: 'li_at',
      value: cookie,
      domain: '.www.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true
    });

    const interceptedData = [];

    // Listen to network responses
    page.on('response', async (response) => {
      const url = response.url();
      // Intercept any Voyager API profiles requests that return JSON
      if (url.includes('/voyager/api/identity/profiles') || url.includes('graphql')) {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json') || contentType.includes('vnd.linkedin')) {
          try {
            const json = await response.json();
            interceptedData.push(json);
          } catch (e) {
            // Ignore non-json or chunked responses
          }
        }
      }
    });

    console.log(`🌐 Navigating to ${PROFILE_URL}...`);
    // 'domcontentloaded' is safer than 'networkidle2' because LinkedIn has endless tracking pixels
    await page.goto(PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for the main profile container to ensure the React app booted
    await page.waitForSelector('.pv-top-card', { timeout: 15000 }).catch(() => {
      console.log('⚠️ Could not find standard profile container, continuing anyway...');
    });
    
    // If we land on authwall, cookie is invalid
    if (page.url().includes('login') || page.url().includes('authwall')) {
      throw new Error('Cookie "li_at" has expired. Please copy a new one from your browser.');
    }

    // Scroll down slowly to trigger lazy-loaded sections (Experience, Certifications)
    console.log('📜 Scrolling page to trigger data loading...');
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 500);
      });
    });

    // Wait a couple more seconds for API requests to settle
    await new Promise(r => setTimeout(r, 2000));

    if (interceptedData.length === 0) {
      throw new Error('No profile data intercepted. The page structure might have changed.');
    }

    const linkedInData = extractProfileData(interceptedData);

    console.log(`✅ Profile data intercepted and extracted successfully!`);
    console.log(`   📚 Education: ${linkedInData.education?.length || 0} entries`);
    console.log(`   🏆 Certifications: ${linkedInData.certifications?.length || 0} entries`);
    console.log(`   💼 Experience: ${linkedInData.experience?.length || 0} entries`);
    console.log(`   🛠️  Skills: ${linkedInData.linkedin_skills?.length || 0} entries`);

    if (!linkedInData.experience && !linkedInData.education && !linkedInData.skills) {
      console.warn('⚠️ Warning: No data was extracted from the intercepted payloads. Could mean array structures changed.');
    }

    // Merge and save
    const merged = mergeProfile(existing, linkedInData);
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    
    console.log(`\n💾 Updated profile.json successfully.`);

  } catch (err) {
    console.error(`\n❌ Puppeteer sync failed:\n${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
