/**
 * LinkedIn → Profile.json Auto-Sync Script
 * 
 * Uses LinkedIn's internal Voyager API with your li_at session cookie
 * to fetch your latest profile data and merge it into profile.json.
 * 
 * Usage:
 *   LINKEDIN_COOKIE="your_li_at_cookie" node scripts/sync-linkedin.mjs
 * 
 * The cookie can also be set via .env file or GitHub Actions secret.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '..', 'public', 'data', 'profile.json');
const LINKEDIN_VANITY = 'adam-naeman'; // Your LinkedIn vanity URL slug

// ---- LinkedIn API Helpers ----
const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';
const HEADERS = {
  'accept': 'application/vnd.linkedin.normalized+json+2.1',
  'x-li-lang': 'en_US',
  'x-restli-protocol-version': '2.0.0',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

async function fetchLinkedIn(endpoint, cookie) {
  const url = `${VOYAGER_BASE}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      ...HEADERS,
      'cookie': `li_at=${cookie}`,
      'csrf-token': cookie.substring(0, 20),
      'x-li-track': '{"clientVersion":"1.13.8888"}',
    },
  });

  if (!response.ok) {
    throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ---- Fetch Full Profile ----
async function fetchProfile(cookie) {
  console.log('📡 Fetching LinkedIn profile...');

  // Step 1: Get profile basics
  const profileData = await fetchLinkedIn(
    `/identity/profiles/${LINKEDIN_VANITY}`,
    cookie
  );

  // Step 2: Get profile view (education, certifications, skills, etc.)
  const profileView = await fetchLinkedIn(
    `/identity/profiles/${LINKEDIN_VANITY}/profileView`,
    cookie
  );

  return { profileData, profileView };
}

// ---- Extract Data ----
function extractProfileData(raw) {
  const { profileData, profileView } = raw;

  const profile = profileData || {};
  const included = profileView?.included || [];

  // Extract education
  const education = included
    .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Education')
    .map((edu) => ({
      institution: edu.schoolName || '',
      degree: [edu.degreeName, edu.fieldOfStudy].filter(Boolean).join(', '),
      period: formatDateRange(edu.timePeriod),
      grade: edu.grade || '',
      highlights: edu.activities ? [edu.activities] : [],
    }))
    .sort((a, b) => {
      // Sort by start year descending
      const yearA = parseInt(a.period) || 0;
      const yearB = parseInt(b.period) || 0;
      return yearB - yearA;
    });

  // Extract certifications
  const certifications = included
    .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Certification')
    .map((cert) => ({
      name: cert.name || '',
      issuer: cert.authority || '',
      date: formatDate(cert.timePeriod?.startDate),
      icon: 'award',
    }));

  // Extract skills
  const skills = included
    .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Skill')
    .map((s) => s.name)
    .filter(Boolean);

  // Extract experience
  const experience = included
    .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Position')
    .map((pos) => ({
      title: pos.title || '',
      company: pos.companyName || '',
      period: formatDateRange(pos.timePeriod),
      description: pos.description || '',
      location: pos.locationName || '',
    }))
    .sort((a, b) => {
      const yearA = parseInt(a.period) || 0;
      const yearB = parseInt(b.period) || 0;
      return yearB - yearA;
    });

  return {
    name: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
    title: profile.headline || '',
    location: profile.locationName || profile.geoLocationName || '',
    about: profile.summary || '',
    education,
    certifications,
    linkedin_skills: skills,
    experience,
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

  // Update basic info from LinkedIn
  if (linkedInData.name) merged.name = linkedInData.name;
  if (linkedInData.title) merged.title = linkedInData.title;
  if (linkedInData.location) merged.location = linkedInData.location;
  if (linkedInData.about) merged.about = linkedInData.about;

  // Update education (replace with LinkedIn data)
  if (linkedInData.education.length > 0) {
    merged.education = linkedInData.education;
  }

  // Update certifications (replace with LinkedIn data)
  if (linkedInData.certifications.length > 0) {
    merged.certifications = linkedInData.certifications;
  }

  // Merge skills (combine LinkedIn skills with existing categorized skills)
  if (linkedInData.linkedin_skills.length > 0) {
    // Keep existing categorized skills but add a "linkedin_endorsed" array
    merged.linkedin_skills = linkedInData.linkedin_skills;
  }

  // Add experience if it exists
  if (linkedInData.experience.length > 0) {
    merged.experience = linkedInData.experience;
  }

  // Timestamp
  merged.last_synced = linkedInData.last_synced;

  // PRESERVE user-only fields (these are NOT from LinkedIn)
  // resumes, github, subtitle_roles, social_links, stats, etc.
  // These stay untouched because we only override specific fields above.

  return merged;
}

// ---- Main ----
async function main() {
  const cookie = process.env.LINKEDIN_COOKIE;

  if (!cookie) {
    console.error('❌ Missing LINKEDIN_COOKIE environment variable.');
    console.error('');
    console.error('How to get your LinkedIn cookie:');
    console.error('  1. Log in to linkedin.com in your browser');
    console.error('  2. Open DevTools (F12) → Application → Cookies → linkedin.com');
    console.error('  3. Copy the value of the "li_at" cookie');
    console.error('  4. Run: LINKEDIN_COOKIE="paste_value_here" node scripts/sync-linkedin.mjs');
    console.error('');
    console.error('For GitHub Actions, add it as a repository secret named LINKEDIN_COOKIE.');
    process.exit(1);
  }

  try {
    // Load existing profile
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
      console.log('📂 Loaded existing profile.json');
    } catch {
      console.log('📂 No existing profile.json found, creating new one');
    }

    // Fetch from LinkedIn
    const raw = await fetchProfile(cookie);
    const linkedInData = extractProfileData(raw);

    console.log(`✅ Fetched profile: ${linkedInData.name}`);
    console.log(`   📚 Education: ${linkedInData.education.length} entries`);
    console.log(`   🏆 Certifications: ${linkedInData.certifications.length} entries`);
    console.log(`   💼 Experience: ${linkedInData.experience.length} entries`);
    console.log(`   🛠️  Skills: ${linkedInData.linkedin_skills.length} entries`);

    // Merge
    const merged = mergeProfile(existing, linkedInData);

    // Write back
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    console.log(`\n💾 Updated profile.json at ${PROFILE_PATH}`);
    console.log(`🕐 Last synced: ${merged.last_synced}`);

  } catch (err) {
    console.error('❌ LinkedIn sync failed:', err.message);
    console.error('');
    console.error('Common issues:');
    console.error('  - Cookie expired → Re-copy li_at from browser');
    console.error('  - Rate limited → Try again later');
    console.error('  - LinkedIn API changed → Check for script updates');
    process.exit(1);
  }
}

main();
