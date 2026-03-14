require('dotenv').config();
const mongoose = require('mongoose');
const FacultyPreference = require('../models/FacultyPreference');
const Group = require('../models/Group');

async function fix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB. Finding pending preferences...');

        const prefs = await FacultyPreference.find({ status: 'pending', semester: 5 });
        let fixed = 0;

        for (const p of prefs) {
            if (p.group) {
                const g = await Group.findById(p.group);
                if (g && g.allocatedFaculty) {
                    console.log(`Fixing FacultyPreference for Group ${g.name}`);

                    p.status = 'allocated';
                    p.allocatedFaculty = g.allocatedFaculty;
                    p.allocatedBy = 'admin_allocation';
                    p.allocatedAt = g.allocationDate || new Date();

                    const fId = g.allocatedFaculty.toString();
                    const idx = p.preferences.findIndex(pref => pref.faculty && pref.faculty.toString() === fId);
                    if (idx !== -1) {
                        p.currentFacultyIndex = idx;
                    }

                    await p.save();
                    fixed++;
                }
            }
        }
        console.log(`Done! Fixed ${fixed} FacultyPreference records.`);
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
}

fix();
