const net = require('net');

const TARGET = ''; //isi ip atau domain yang mau di whois

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

const TLD_FALLBACK = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  dev: 'whois.nic.google',
  app: 'whois.nic.google',
  ai: 'whois.nic.ai',
  id: 'whois.id',
  info: 'whois.afilias.net',
  biz: 'whois.nic.biz',
  me: 'whois.nic.me',
  xyz: 'whois.nic.xyz',
  cc: 'ccwhois.verisign-grs.com'
};

function isIp(q) {
  return IPV4_RE.test(q) || IPV6_RE.test(q);
}

function queryWhois(server, query, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(43, server);
    let data = '';

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout menghubungi ${server}`));
    }, timeout);

    socket.on('connect', () => socket.write(query + '\r\n'));
    socket.on('data', c => data += c.toString('utf8'));
    socket.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    socket.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function extractReferral(text) {
  const patterns = [
    /Registrar WHOIS Server:\s*(\S+)/i,
    /ReferralServer:\s*whois:\/\/(\S+)/i,
    /refer:\s*(\S+)/i,
    /whois:\s*(\S+)/i
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1].trim();
  }

  return null;
}

async function chaseWhois(query, startServer) {
  const visited = new Set();
  let server = startServer;
  let lastText = '';
  let hops = 0;

  while (server && !visited.has(server) && hops < 4) {
    visited.add(server);
    hops++;

    let text;

    try {
      text = await queryWhois(server, query);
    } catch (err) {
      if (lastText) break;
      throw err;
    }

    lastText = text || lastText;

    const next = extractReferral(text);
    if (!next || next === server) break;

    server = next;
  }

  return { raw: lastText, finalServer: server };
}

function parseFields(raw) {
  const lines = raw.split(/\r?\n/);
  const fields = {};
  const nameServers = [];
  const statuses = [];

  const map = {
    'domain name': 'domainName',
    'registry domain id': 'domainId',
    'registrar': 'registrar',
    'registrar whois server': 'registrarWhoisServer',
    'registrar url': 'registrarUrl',
    'registrar iana id': 'registrarIanaId',
    'registrar abuse contact email': 'abuseEmail',
    'registrar abuse contact phone': 'abusePhone',
    'creation date': 'createdDate',
    'created date': 'createdDate',
    'registered on': 'createdDate',
    'registry expiry date': 'expiryDate',
    'expiration date': 'expiryDate',
    'expiry date': 'expiryDate',
    'registrar registration expiration date': 'expiryDate',
    'updated date': 'updatedDate',
    'last updated on': 'updatedDate',
    'registrant organization': 'registrantOrg',
    'registrant country': 'registrantCountry',
    'registrant name': 'registrantName',
    'registrant email': 'registrantEmail',
    'netrange': 'netRange',
    'cidr': 'cidr',
    'orgname': 'orgName',
    'org-name': 'orgName',
    'organization': 'orgName',
    'country': 'country',
    'origin': 'origin',
    'originas': 'origin',
    'netname': 'netName',
    'nettype': 'netType',
    'nettype-desc': 'netTypeDesc',
    'inetnum': 'netRange',
    'inet6num': 'netRange',
    'descr': 'description'
  };

  for (const line of lines) {
    const cleaned = line.replace(/^%.*$/, '').trim();
    if (!cleaned) continue;

    const idx = cleaned.indexOf(':');
    if (idx === -1) continue;

    const key = cleaned.slice(0, idx).trim().toLowerCase();
    const value = cleaned.slice(idx + 1).trim();

    if (!value) continue;

    if (key === 'name server' || key === 'nserver') {
      nameServers.push(value.toUpperCase());
      continue;
    }

    if (key === 'domain status' || key === 'status') {
      statuses.push(value);
      continue;
    }

    if (map[key] && !fields[map[key]]) {
      fields[map[key]] = value;
    }
  }

  fields.nameServers = [...new Set(nameServers)];
  fields.statuses = [...new Set(statuses)];

  return fields;
}

async function main() {
  const query = TARGET.trim();

  if (!query) {
    console.log('Isi TARGET dulu di dalam script.');
    return;
  }

  const ipQuery = isIp(query);
  let startServer = 'whois.iana.org';

  if (!ipQuery) {
    const parts = query.split('.');
    const tld = parts[parts.length - 1].toLowerCase();
    if (TLD_FALLBACK[tld]) startServer = TLD_FALLBACK[tld];
  }

  console.log(`Target: ${query} (${ipQuery ? 'IP' : 'Domain'})`);
  console.log(`Server: ${startServer}\n`);

  try {
    const { raw, finalServer } = await chaseWhois(query, startServer);

    if (!raw || !raw.trim()) {
      console.log(`Data WHOIS tidak ditemukan untuk ${query}`);
      return;
    }

    const parsed = parseFields(raw);

    console.log(JSON.stringify({
      query,
      type: ipQuery ? 'ip' : 'domain',
      server: finalServer,
      parsed
    }, null, 2));

    console.log('\n--- RAW ---\n');
    console.log(raw);

  } catch (err) {
    console.log('Gagal mengambil data WHOIS:', err.message);
  }
}

main();
