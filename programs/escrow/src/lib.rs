use anchor_lang::prelude::*;

declare_id!("33333333333333333333333333333333");

#[program]
mod fartnode_escrow {
	use super::*;

	pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
		msg!("FARTNODE escrow program stub");
		Ok(())
	}
}

#[derive(Accounts)]
pub struct Initialize {}
