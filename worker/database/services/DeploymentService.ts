import { eq, and, desc } from 'drizzle-orm';
import { BaseService } from './BaseService';
import { deployments, deploymentCredentials } from '../schema';
import type { Deployment, NewDeployment, DeploymentCredential, NewDeploymentCredential } from '../schema';
import { generateId } from '../../utils/id';

export class DeploymentDbService extends BaseService {
	async createDeployment(deployment: Omit<NewDeployment, 'id'>): Promise<Deployment> {
		try {
			const id = generateId('deployment');
			const newDeployment: NewDeployment = {
				id,
				...deployment,
			};

			const result = await this.database.insert(deployments).values(newDeployment).returning();

			if (!result[0]) {
				throw new Error('Failed to create deployment');
			}

			this.logger.info('Deployment created', { deploymentId: id, provider: deployment.provider });
			return result[0];
		} catch (error) {
			return this.handleDatabaseError(error, 'createDeployment', { deployment });
		}
	}

	async getDeploymentById(deploymentId: string): Promise<Deployment | null> {
		try {
			const result = await this.database
				.select()
				.from(deployments)
				.where(eq(deployments.id, deploymentId))
				.limit(1);

			return result[0] || null;
		} catch (error) {
			return this.handleDatabaseError(error, 'getDeploymentById', { deploymentId });
		}
	}

	async getDeploymentsByAppId(appId: string): Promise<Deployment[]> {
		try {
			return await this.database
				.select()
				.from(deployments)
				.where(eq(deployments.appId, appId))
				.orderBy(desc(deployments.createdAt));
		} catch (error) {
			return this.handleDatabaseError(error, 'getDeploymentsByAppId', { appId });
		}
	}

	async getDeploymentByAppAndProvider(
		appId: string,
		provider: Deployment['provider'],
	): Promise<Deployment | null> {
		try {
			const result = await this.database
				.select()
				.from(deployments)
				.where(and(eq(deployments.appId, appId), eq(deployments.provider, provider)))
				.orderBy(desc(deployments.createdAt))
				.limit(1);

			return result[0] || null;
		} catch (error) {
			return this.handleDatabaseError(error, 'getDeploymentByAppAndProvider', { appId, provider });
		}
	}

	async updateDeployment(
		deploymentId: string,
		updates: Partial<Omit<Deployment, 'id' | 'appId' | 'provider' | 'createdAt'>>,
	): Promise<Deployment | null> {
		try {
			const result = await this.database
				.update(deployments)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(eq(deployments.id, deploymentId))
				.returning();

			if (!result[0]) {
				throw new Error('Deployment not found');
			}

			this.logger.info('Deployment updated', { deploymentId, updates });
			return result[0];
		} catch (error) {
			return this.handleDatabaseError(error, 'updateDeployment', { deploymentId, updates });
		}
	}

	async updateDeploymentStatus(
		deploymentId: string,
		status: Deployment['status'],
		errorMessage?: string,
	): Promise<Deployment | null> {
		try {
			const updates: Partial<Deployment> = {
				status,
				updatedAt: new Date(),
			};

			if (errorMessage) {
				updates.errorMessage = errorMessage;
			}

			if (status === 'ready') {
				updates.deployedAt = new Date();
			}

			const result = await this.database
				.update(deployments)
				.set(updates)
				.where(eq(deployments.id, deploymentId))
				.returning();

			if (!result[0]) {
				throw new Error('Deployment not found');
			}

			this.logger.info('Deployment status updated', { deploymentId, status });
			return result[0];
		} catch (error) {
			return this.handleDatabaseError(error, 'updateDeploymentStatus', { deploymentId, status });
		}
	}

	async deleteDeployment(deploymentId: string): Promise<boolean> {
		try {
			const result = await this.database.delete(deployments).where(eq(deployments.id, deploymentId)).returning();

			this.logger.info('Deployment deleted', { deploymentId });
			return result.length > 0;
		} catch (error) {
			return this.handleDatabaseError(error, 'deleteDeployment', { deploymentId });
		}
	}

	async createDeploymentCredential(
		credential: Omit<NewDeploymentCredential, 'id'>,
	): Promise<DeploymentCredential> {
		try {
			const id = generateId('deployment-credential');

			if (credential.isDefault) {
				await this.database
					.update(deploymentCredentials)
					.set({ isDefault: false })
					.where(
						and(
							eq(deploymentCredentials.userId, credential.userId),
							eq(deploymentCredentials.provider, credential.provider),
						),
					);
			}

			const newCredential: NewDeploymentCredential = {
				id,
				...credential,
			};

			const result = await this.database.insert(deploymentCredentials).values(newCredential).returning();

			if (!result[0]) {
				throw new Error('Failed to create deployment credential');
			}

			this.logger.info('Deployment credential created', { credentialId: id, provider: credential.provider });
			return result[0];
		} catch (error) {
			return this.handleDatabaseError(error, 'createDeploymentCredential', { credential });
		}
	}

	async getDeploymentCredentialsByUserId(userId: string): Promise<DeploymentCredential[]> {
		try {
			return await this.database
				.select()
				.from(deploymentCredentials)
				.where(eq(deploymentCredentials.userId, userId))
				.orderBy(desc(deploymentCredentials.createdAt));
		} catch (error) {
			return this.handleDatabaseError(error, 'getDeploymentCredentialsByUserId', { userId });
		}
	}

	async getDeploymentCredentialsByProvider(
		userId: string,
		provider: DeploymentCredential['provider'],
	): Promise<DeploymentCredential[]> {
		try {
			return await this.database
				.select()
				.from(deploymentCredentials)
				.where(
					and(eq(deploymentCredentials.userId, userId), eq(deploymentCredentials.provider, provider)),
				)
				.orderBy(desc(deploymentCredentials.createdAt));
		} catch (error) {
			return this.handleDatabaseError(error, 'getDeploymentCredentialsByProvider', { userId, provider });
		}
	}

	async getDefaultDeploymentCredential(
		userId: string,
		provider: DeploymentCredential['provider'],
	): Promise<DeploymentCredential | null> {
		try {
			const result = await this.database
				.select()
				.from(deploymentCredentials)
				.where(
					and(
						eq(deploymentCredentials.userId, userId),
						eq(deploymentCredentials.provider, provider),
						eq(deploymentCredentials.isDefault, true),
					),
				)
				.limit(1);

			return result[0] || null;
		} catch (error) {
			return this.handleDatabaseError(error, 'getDefaultDeploymentCredential', { userId, provider });
		}
	}

	async updateDeploymentCredential(
		credentialId: string,
		updates: Partial<Omit<DeploymentCredential, 'id' | 'userId' | 'provider' | 'createdAt'>>,
	): Promise<DeploymentCredential | null> {
		try {
			if (updates.isDefault) {
				const credential = await this.database
					.select()
					.from(deploymentCredentials)
					.where(eq(deploymentCredentials.id, credentialId))
					.limit(1);

				if (credential[0]) {
					await this.database
						.update(deploymentCredentials)
						.set({ isDefault: false })
						.where(
							and(
								eq(deploymentCredentials.userId, credential[0].userId),
								eq(deploymentCredentials.provider, credential[0].provider),
							),
						);
				}
			}

			const result = await this.database
				.update(deploymentCredentials)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(eq(deploymentCredentials.id, credentialId))
				.returning();

			if (!result[0]) {
				throw new Error('Deployment credential not found');
			}

			this.logger.info('Deployment credential updated', { credentialId, updates });
			return result[0];
		} catch (error) {
			return this.handleDatabaseError(error, 'updateDeploymentCredential', { credentialId, updates });
		}
	}

	async deleteDeploymentCredential(credentialId: string): Promise<boolean> {
		try {
			const result = await this.database
				.delete(deploymentCredentials)
				.where(eq(deploymentCredentials.id, credentialId))
				.returning();

			this.logger.info('Deployment credential deleted', { credentialId });
			return result.length > 0;
		} catch (error) {
			return this.handleDatabaseError(error, 'deleteDeploymentCredential', { credentialId });
		}
	}

	async setDefaultCredential(credentialId: string): Promise<DeploymentCredential | null> {
		try {
			const credential = await this.database
				.select()
				.from(deploymentCredentials)
				.where(eq(deploymentCredentials.id, credentialId))
				.limit(1);

			if (!credential[0]) {
				throw new Error('Credential not found');
			}

			await this.database
				.update(deploymentCredentials)
				.set({ isDefault: false })
				.where(
					and(
						eq(deploymentCredentials.userId, credential[0].userId),
						eq(deploymentCredentials.provider, credential[0].provider),
					),
				);

			const result = await this.database
				.update(deploymentCredentials)
				.set({ isDefault: true, updatedAt: new Date() })
				.where(eq(deploymentCredentials.id, credentialId))
				.returning();

			if (!result[0]) {
				throw new Error('Failed to set default credential');
			}

			this.logger.info('Default credential set', { credentialId, provider: credential[0].provider });
			return result[0];
		} catch (error) {
			return this.handleDatabaseError(error, 'setDefaultCredential', { credentialId });
		}
	}
}
