const mongoose = require('mongoose');

/**
 * Seeds two distinct, deliberately differently-named test organizations and their users.
 * 
 * Organization A:
 * - name: "Acme Corporation"
 * - slug: "acme-corp"
 * - admin user: admin@acme.com (Org A Admin)
 * - engineer user: engineer@acme.com (Org A Engineer)
 * 
 * Organization B:
 * - name: "Globex Industries"
 * - slug: "globex-industries"
 * - admin user: admin@globex.com (Org B Admin)
 * - engineer user: engineer@globex.com (Org B Engineer)
 */
async function seedTwoOrgs(mockOrgModel, mockUserModel) {
  const orgAId = new mongoose.Types.ObjectId();
  const orgBId = new mongoose.Types.ObjectId();

  const orgA = new mockOrgModel({
    _id: orgAId,
    name: 'Acme Corporation',
    slug: 'acme-corp',
    isActive: true
  });

  const orgB = new mockOrgModel({
    _id: orgBId,
    name: 'Globex Industries',
    slug: 'globex-industries',
    isActive: true
  });

  await orgA.save();
  await orgB.save();

  const users = [
    // Org A Users
    new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgAId,
      name: 'Acme Admin User',
      email: 'admin@acme.com',
      role: 'org_admin',
      isActive: true,
      passwordHash: 'dummy_hash_acme_admin'
    }),
    new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgAId,
      name: 'Acme Engineer User',
      email: 'engineer@acme.com',
      role: 'devops_engineer',
      isActive: true,
      passwordHash: 'dummy_hash_acme_eng'
    }),
    // Org B Users
    new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgBId,
      name: 'Globex Admin User',
      email: 'admin@globex.com',
      role: 'org_admin',
      isActive: true,
      passwordHash: 'dummy_hash_globex_admin'
    }),
    new mockUserModel({
      _id: new mongoose.Types.ObjectId(),
      orgId: orgBId,
      name: 'Globex Engineer User',
      email: 'engineer@globex.com',
      role: 'devops_engineer',
      isActive: true,
      passwordHash: 'dummy_hash_globex_eng'
    })
  ];

  for (const user of users) {
    await user.save();
  }

  return {
    orgA,
    orgB,
    orgAUsers: users.filter(u => u.orgId.toString() === orgAId.toString()),
    orgBUsers: users.filter(u => u.orgId.toString() === orgBId.toString())
  };
}

module.exports = {
  seedTwoOrgs
};
