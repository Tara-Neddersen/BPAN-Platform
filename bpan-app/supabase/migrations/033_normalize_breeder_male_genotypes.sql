update public.breeder_cages
set male_genotype = 'wt'
where male_genotype is not null
  and male_genotype not in ('wt', 'hemi');
