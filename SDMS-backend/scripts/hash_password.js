#!/usr/bin/env node
import 'dotenv/config';
import bcrypt from 'bcrypt';

async function run(){
  const password = process.argv[2];
  const rounds = parseInt(process.argv[3] || '12', 10);
  if(!password){
    console.error('Usage: node scripts/hash_password.js <plainPassword> [rounds=12]');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, rounds);
  console.log(hash);
}
run();
