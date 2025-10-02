#!/usr/bin/env node
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { query } from '../src/db.js';

/*
Usage:
  node scripts/set_password.js <username_or_email> <newPlainPassword> [rounds]
*/
async function run(){
  const ident = process.argv[2];
  const password = process.argv[3];
  const rounds = parseInt(process.argv[4] || '12', 10);
  if(!ident || !password){
    console.error('Usage: node scripts/set_password.js <username_or_email> <newPlainPassword> [rounds=12]');
    process.exit(1);
  }
  const { rows } = await query('SELECT id, username, email FROM accounts WHERE LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($1)', [ident]);
  if(!rows.length){
    console.error('Account not found for identifier:', ident);
    process.exit(2);
  }
  const acc = rows[0];
  const hash = await bcrypt.hash(password, rounds);
  await query('UPDATE accounts SET password_hash=$1 WHERE id=$2', [hash, acc.id]);
  console.log(`Updated password for account ${acc.username || acc.email}`);
}
run().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });
