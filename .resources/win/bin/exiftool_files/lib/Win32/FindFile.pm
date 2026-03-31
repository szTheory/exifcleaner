package Win32::FindFile;
use strict;
use warnings;

require Exporter;

our @ISA = qw(Exporter);

# Items to export into callers namespace by default. Note: do not export
# names by default without a very good reason. Use EXPORT_OK instead.
# Do not simply export all your public functions/methods/constants.

# This allows declaration	use Win32::FindFile ':all';
# If you do not need this, moving things directly into @EXPORT or @EXPORT_OK
# will save memory.
our %EXPORT_TAGS = ( 'all' => [ qw(
	FindFile 
	ReadDir
	FileTime
	FileData
	wchar 
	uchar
	wfchar

	DeleteFile
	MoveFile
	CopyFile
	RemoveDirectory
	CreateDirectory

	GetFullPathName
	GetCurrentDirectory 
	SetCurrentDirectory 

	GetBinaryType
	GetCompressedFileSize
	GetFileAttributes
	SetFileAttributes
	GetLongPathName

	AreFileApisANSI
	SetFileApisToOEM
	SetFileApisToANSI
	) ] );

our @EXPORT_OK = ( @{ $EXPORT_TAGS{'all'} } );

our @EXPORT = qw(
	FindFile FileData FileTime	
);
use constant { 
    FileData => __PACKAGE__ . '::' .'_WFD',
    FileTime => __PACKAGE__ . '::' .'_WFT',};


BEGIN{
	our $VERSION = '0.15';
	require XSLoader;
	XSLoader::load('Win32::FindFile', $VERSION);
};
use autouse Carp => qw(carp croak);
sub ReadDir{
	croak( 'Usage Win32::FindFile::ReadDir( $dir )' ) unless 1 == @_ && defined $_[0];
	my $folder = $_[0];
	croak( 'Usage Win32::FindFile::ReadDir( $dir ) - $dir contains * ?' )
		if $folder=~m/[\*\?]/;
	$folder=~s/\/+\z//g;
	@_ = ();
	@_ = $folder;
	$_[0].="\\*";
	goto &FindFile;
}

# Preloaded methods go here.

1;
__END__
# Below is stub documentation for your module. You'd better edit it!

=head1 NAME

Win32::FindFile - simple unicode directory reader under Win32

=head1 SYNOPSIS

  use Win32::FindFile;
  use bytes;
  
  my @txt_files = FindFile( "*.txt" );
  my @dir_content = ReadDir( "." );

  # and finally
  # print entire directory content in unicode 
  #
  for ( @dir_content ){
	next unless $file->is_entry # skip over '.', '..'
	next if $file->is_hidden; # skip over hidden files
	next if $file->is_system; # etc

	next if $file->ftCreationTime   > time -10; # skip over files created recently
	next if $file->ftLastWriteTime  > time -10;
	next if $file->ftLastAccessTime > time -10; 

	next if $file->FileSize == 0; # 

	print $file->relName( "$dirname" ), "\n" ; # same as "dirname/$file" (Unix style)
	print $file->relName( "$dirname", "\\" ), "\n" ; # same as "dirname\\$file" (Win style)

	print $file, "\n"; # $file->cFileName
	print $file->dosName, "\n";

	my $s = $file->dwFileAttributes; # Get all attribytes
  };

  print "Current directory is ", GetCurrentDirectory(), "\n";



=head1 DESCRIPTION

	Win32::FindFile are simple tool for reading unicode dir content. It call kernel32.dll unicode functions
	FindFirstFileW, FindNextFileW, and covert UTF-16 to utf8 and back there is needed.

	Main Function is FindFile that take pattern of form '*' or '$directory\*' or more complex "$directory\*.txt"
	and return records from FileFileNextW as Class.

	Other function are utility functions as Copy, Move, GetCurrentDirectory, SetCurrentDirectory, ... etc.

=head2 EXPORT

=head3 C<FindFile>

	FindFile( $GlobPattern ); 

	@file_matches = FindFile( "$Dir\*" ) or "warn not files match";
	@file_matches = FindFile( "*" ) ; # list current directory;
	@file_matches = FindFile( "A*") ; # list files beginning with A letter

=head3 C<GetCurrentDirectory>

	$curpwd = CurrentDirectory();

=head3 C<SetCurrentDirectory>

	SetCurrentDirectory( $next_curpwd ); # set current directory

=head3 C<GetFullPathName>

	$absolute_path = GetFullPathName( $filename ) 

    Expand file name to absolute path

=over 4
EXPORT

=item  DeleteFile( $file )

=item  CopyFile($from, $to, $fail_if_overwrite)

=item  MoveFile($from, $to)

=item  RemoveDirectory( $dir )

=item  CreateDirectory( $dir )

=item  GetBinaryType( $file )

=item  GetCompressedFileSize($file)

=item  GetFileAttributes($file)

=item  GetFileAttributes( $file, $attr )

=item  GetLongPathName( $file )

=item AreFileApisANSI

=item SetFileApisToOEM

=item SetFileApisToANSI

=back

=cut

=head1 SEE ALSO

L<Win32>, L<Win32API>, L<Win32::UNICODE>, L<Win32::LongPath>

=head1 AUTHOR

A. G. Grishaev, E<lt>grian@cpan.orgE<gt>

=head1 COPYRIGHT AND LICENSE

Copyright (C) 2014 by A. G. Grishaev

This library is free software; you can redistribute it and/or modify
it under the same terms as Perl itself, either Perl version 5.10.1 or,
at your option, any later version of Perl 5 you may have available.


=cut
