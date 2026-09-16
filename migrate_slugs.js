import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './src/models/Product.js';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const products = await Product.find({ slug: { $exists: false } });
    console.log(`Found ${products.length} products without slug.`);

    for (const p of products) {
      if (p.name) {
        let baseSlug = `${p.name}-${p.qrType || 'PHYSICAL'}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        let slug = baseSlug;
        let count = 1;
        
        while (true) {
          const exists = await Product.findOne({ slug });
          if (!exists) break;
          slug = `${baseSlug}-${count}`;
          count++;
        }

        p.slug = slug;
        await p.save();
        console.log(`Updated ${p.name} -> ${slug}`);
      }
    }
    
    console.log('Done');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
