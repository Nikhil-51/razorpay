const fs = require('fs');
const path = 'd:/razorpay/supabase/functions/generate-demo/index.ts';
let content = fs.readFileSync(path, 'utf8');

// Currency
content = content.replace(/'USD'/g, "'INR'");

// Counterparty / Customer Names
content = content.replace(/STRIPE INC/g, 'RAZORPAY SOFTWARE');
content = content.replace(/Stripe Incorporated/g, 'Razorpay Software Private Limited');

// IDs
content = content.replace(/PAY-/g, 'pout_');
content = content.replace(/LED-/g, 'inv_');

// Increase amounts to make it more realistic for INR (no regex double matching issues)
const factor = 80;
// We'll just replace the exact numbers that we know are in the file to avoid regex mess
const replaces = {
    '1000': 1000 * factor,
    '970': 970 * factor,
    '30': 30 * factor,
    '1250.04': 1250.04 * factor,
    '1250.00': 1250.00 * factor,
    '2000': 2000 * factor,
    '1500': 1500 * factor,
    '500': 500 * factor,
    '800': 800 * factor,
    '15': 15 * factor,
    '450': 450 * factor,
    '333': 333 * factor,
    '777': 777 * factor
};

for (const [oldVal, newVal] of Object.entries(replaces)) {
    // Only match as a whole number using word boundaries
    const regex = new RegExp(`\\b${oldVal.replace('.', '\\.')}\\b`, 'g');
    content = content.replace(regex, newVal.toString());
}

// Ensure the random amount generation in loop also is realistic
content = content.replace(/100 \+ Math\.floor\(random\(\) \* 1000\)/g, '8000 + Math.floor(random() * 80000)');

fs.writeFileSync(path, content);
console.log('Done');
