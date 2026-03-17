/**
 * LinkedIn → Profile.json Auto-Sync Script
 * 
 * Uses LinkedIn's internal API with your li_at session cookie
 * to fetch your latest profile data and merge it into profile.json.
 * 
 * Usage:
 *   LINKEDIN_COOKIE="your_li_at_cookie" node scripts/sync-linkedin.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '..', 'public', 'data', 'profile.json');
const LINKEDIN_VANITY = 'adam-naeman';

// ---- Fetch from LinkedIn with proper auth ----
async function linkedInFetch(url, cookie) {
  const response = await fetch(url, {
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-li-lang': 'en_US',
      'x-restli-protocol-version': '2.0.0',
      'x-li-page-instance': 'urn:li:page:d_flagship3_profile_view_base;',
      'csrf-token': 'ajax:0',
      'cookie': `li_at=${cookie}; JSESSIONID="ajax:0"`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LinkedIn API ${response.status}: ${response.statusText} — ${text.substring(0, 200)}`);
  }

  return response.json();
}

// ---- Fetch Full Profile ----
async function fetchProfile(cookie) {
  console.log('📡 Fetching LinkedIn profile...');

  // Use the modern identity profiles endpoint
  // 410 Gone usually means the old /profileView slug endpoint was deprecated
  const data = await linkedInFetch(
    `https://www.linkedin.com/voyager/api/identity/profiles?q=memberIdentity&memberIdentity=${LINKEDIN_VANITY}`,
    cookie
  );

  // We also need the profileView specifically for full education/experience details
  const viewData = await linkedInFetch(
    `https://www.linkedin.com/voyager/api/identity/profiles/${LINKEDIN_VANITY}/profileView`,
    cookie
  ).catch(err => {
    console.warn('⚠️ profileView endpoint failed, trying alternative...', err.message);
    return null;
  });

  return { data, viewData };
}

// ---- Extract Data from Profile View ----
function extractProfileData(raw) {
  // Combine elements from both endpoints if available
  const elements = raw.data?.elements || [];
  const profile = elements[0] || {};
  
  const included = raw.viewData?.included || raw.data?.included || [];

  // Extract education
  const education = included
    .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Education')
    .map((edu) => ({
      institution: edu.schoolName || '',
      degree: [edu.degreeName, edu.fieldOfStudy].filter(Boolean).join(', '),
      period: formatDateRange(edu.timePeriod),
      grade: edu.grade || '',
      highlights: edu.activities ? [edu.activities] : [],
    }));

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

  // Extract experience/positions
  const experience = included
    .filter((item) => item.$type === 'com.linkedin.voyager.identity.profile.Position')
    .map((pos) => ({
      title: pos.title || '',
      company: pos.companyName || '',
      period: formatDateRange(pos.timePeriod),
      description: pos.description || '',
      location: pos.locationName || '',
    }));

  return {
    name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || undefined,
    title: profile.headline || undefined,
    location: profile.locationName || profile.geoLocationName || undefined,
    about: profile.summary || undefined,
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

  // Only override fields that LinkedIn returned (non-undefined)
  if (linkedInData.name) merged.name = linkedInData.name;
  if (linkedInData.title) merged.title = linkedInData.title;
  if (linkedInData.location) merged.location = linkedInData.location;
  if (linkedInData.about) merged.about = linkedInData.about;
  if (linkedInData.education) merged.education = linkedInData.education;
  if (linkedInData.certifications) merged.certifications = linkedInData.certifications;
  if (linkedInData.linkedin_skills) merged.linkedin_skills = linkedInData.linkedin_skills;
  if (linkedInData.experience) merged.experience = linkedInData.experience;

  merged.last_synced = linkedInData.last_synced;

  // PRESERVE: resumes, github, subtitle_roles, social_links, stats, skills (categorized), avatar_url, email
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

    console.log(`✅ Fetched profile: ${linkedInData.name || '(name not found)'}`);
    console.log(`   📚 Education: ${linkedInData.education?.length || 0} entries`);
    console.log(`   🏆 Certifications: ${linkedInData.certifications?.length || 0} entries`);
    console.log(`   💼 Experience: ${linkedInData.experience?.length || 0} entries`);
    console.log(`   🛠️  Skills: ${linkedInData.linkedin_skills?.length || 0} entries`);

    // Merge
    const merged = mergeProfile(existing, linkedInData);

    // Write back
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    console.log(`\n💾 Updated profile.json`);
    console.log(`🕐 Last synced: ${merged.last_synced}`);

  } catch (err) {
    console.error('❌ LinkedIn sync failed:', err.message);
    console.error('');
    if (err.message.includes('401') || err.message.includes('403')) {
      console.error('🔑 Your cookie has expired. Please re-copy li_at from your browser.');
    } else {
      console.error('Common issues:');
      console.error('  - Cookie expired → Re-copy li_at from browser');
      console.error('  - Rate limited → Try again later');
    }
    process.exit(1);
  }
}

main();
