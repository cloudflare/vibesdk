use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
mod fartnode_points {
	use super::*;

	pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
		msg!("FARTNODE points program stub");
		Ok(())
	}
}

#[derive(Accounts)]
pub struct Initialize {}
