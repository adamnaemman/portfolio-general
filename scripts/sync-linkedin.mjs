/**
 * LinkedIn → Profile.json Auto-Sync Script
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '..', 'public', 'data', 'profile.json');
const LINKEDIN_VANITY = 'adam-naeman';

// ---- Fetch from LinkedIn with perfectly forged Voyager auth ----
async function linkedInFetch(url, cookie) {
  // Clean the cookie in case it was copied with quotes
  const cleanCookie = cookie.replace(/^"|"$/g, '').trim();
  
  // Generate our own CSRF token and inject it as JSESSIONID
  const csrf = 'ajax:' + Math.random().toString(36).substring(2);

  const response = await fetch(url, {
    headers: {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-li-lang': 'en_US',
      'x-restli-protocol-version': '2.0.0',
      'csrf-token': csrf,
      'cookie': `li_at=${cleanCookie}; JSESSIONID="${csrf}"`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });

  const status = response.status;
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API returned ${status}. Details: ${text.substring(0, 150)}`);
  }

  return response.json();
}

// ---- Fetch Full Profile with fallback endpoints ----
async function fetchProfile(cookie) {
  console.log('📡 Fetching LinkedIn profile...');

  let data = null;
  const errors = [];

  // Try Endpoint 1: Modern Identity Profiles
  try {
    console.log('   ↳ Trying modern endpoint...');
    data = await linkedInFetch(
      `https://www.linkedin.com/voyager/api/identity/profiles?q=memberIdentity&memberIdentity=${LINKEDIN_VANITY}`,
      cookie
    );
    if (data?.elements?.length > 0) return { data };
  } catch (err) {
    errors.push(`Modern: ${err.message}`);
  }

  // Try Endpoint 2: Base Profile
  try {
    console.log('   ↳ Trying base endpoint...');
    data = await linkedInFetch(
      `https://www.linkedin.com/voyager/api/identity/profiles/${LINKEDIN_VANITY}`,
      cookie
    );
    if (data) return { data };
  } catch (err) {
    errors.push(`Base: ${err.message}`);
  }

  // Try Endpoint 3: Legacy ProfileView
  try {
    console.log('   ↳ Trying legacy profileView endpoint...');
    data = await linkedInFetch(
      `https://www.linkedin.com/voyager/api/identity/profiles/${LINKEDIN_VANITY}/profileView`,
      cookie
    );
    if (data) return { data };
  } catch (err) {
    errors.push(`Legacy: ${err.message}`);
  }

  throw new Error(`All endpoints failed.\nErrors:\n${errors.join('\n')}`);
}

// ---- Extract Data from any schema version ----
function extractProfileData(raw) {
  const elements = raw.data?.elements || [];
  const included = raw.data?.included || [];
  
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
  const cookie = process.env.LINKEDIN_COOKIE;

  if (!cookie) {
    console.error('❌ Missing LINKEDIN_COOKIE environment variable.');
    process.exit(1);
  }

  try {
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));
    } catch {
      console.log('📂 No existing profile.json found');
    }

    const raw = await fetchProfile(cookie);
    const linkedInData = extractProfileData(raw);

    console.log(`✅ Fetched profile successfully!`);
    console.log(`   📚 Education: ${linkedInData.education?.length || 0} entries`);
    console.log(`   🏆 Certifications: ${linkedInData.certifications?.length || 0} entries`);
    console.log(`   💼 Experience: ${linkedInData.experience?.length || 0} entries`);
    console.log(`   🛠️  Skills: ${linkedInData.linkedin_skills?.length || 0} entries`);

    const merged = mergeProfile(existing, linkedInData);
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    
    console.log(`\n💾 Updated profile.json`);
  } catch (err) {
    console.error(`\n❌ LinkedIn sync failed:\n${err.message}`);
    process.exit(1);
  }
}

main();
