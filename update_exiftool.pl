#!/usr/bin/env perl

# Download the latest version of ExifTool for Unix and Windows
# and verify their checksums.
#
# The Unix version is taken from the source archive, removes
# extra help files to reduce filesize, and squashed down into a single
# Perl file.
#
# The Windows version is a prepacked EXE that is simply extracted
# from the zip archive.
package UpdateExifTool 1.0;

use strict;         #complain when a variable is used before declaration
use warnings;       #output run-time warnings to catch bugs early
use diagnostics;    #verbose warnings, consumes memory so disable in production
use autodie;    #functions throw exception on failure instead of returning false
use utf8;       #enable UTF-8 in source code
use open qw(:std :utf8);    #set default encoding of filehandles to UTF-8

use constant EXIFTOOL_BASE_URL     => 'https://exiftool.org/';
use constant CHECKSUMS_URL         => EXIFTOOL_BASE_URL . 'checksums.txt';
use constant DOWNLOADS_WORKING_DIR => 'exiftool_downloads';
use constant RESOURCES_DIR         => '.resources';
use constant BIN_DIR_UNIX          => RESOURCES_DIR . '/nix/bin';
use constant BIN_DIR_WINDOWS       => RESOURCES_DIR . '/win/bin';

# Example checksum file output:
#
# SHA1(Image-ExifTool-12.01.tar.gz)= 140f014e7686ed80528b919d64c4de0a869e59aa
# SHA1(exiftool-12.01.zip)= a28c3f943165d1eec3ff69bb665390e340686ec6
# SHA1(ExifTool-12.01.dmg)= 327fd67f60fd7f62742d4ddb2f9999da13dc785f
# MD5 (Image-ExifTool-12.01.tar.gz) = 6980a6d435f83c0af060148a354acf24
# MD5 (exiftool-12.01.zip) = e11260548ebff70a3ce27d48e46dfe94
# MD5 (ExifTool-12.01.dmg) = 7a41e56901564f9bd4eb3f907846c118
sub get_checksum_file_text {
  my $command = 'curl ' . CHECKSUMS_URL;

  return qx($command);
}

sub get_code_zip_info {
  my $checksum_file_text = shift;

  my ( $filename, $sha1 ) =
    $checksum_file_text =~ /SHA1\((Image-ExifTool-[\w.]+tar[.]gz)\)= (\w+)/m;

  return ( $filename, $sha1 );
}

sub get_windows_exe_info {
  my $checksum_file_text = shift;

  my ( $filename, $sha1 ) =
    $checksum_file_text =~ /SHA1\((exiftool-[\w.]+zip)\)= (\w+)/m;

  return ( $filename, $sha1 );
}

sub make_downloads_working_dir {
  unless ( -d DOWNLOADS_WORKING_DIR ) {
    my @command = ( 'mkdir', DOWNLOADS_WORKING_DIR );
    system(@command) == 0 or die "system @command failed: $?";
  }

  return;
}

sub download_file {
  my $filename = shift;

  my $url     = EXIFTOOL_BASE_URL . $filename;
  my @command = (
    'wget', '--no-clobber', '--directory-prefix', DOWNLOADS_WORKING_DIR, $url
  );
  system(@command) == 0 or die "system @command failed: $?";

  return;
}

sub verify_checksum {
  my ( $filename, $sha1 ) = @_;

  my $command           = 'shasum ' . DOWNLOADS_WORKING_DIR . "/$filename";
  my $output            = qx($command);
  my ($calculated_sha1) = split( ' ', $output );

  print "$filename - $calculated_sha1";
  my $is_match = $sha1 eq $calculated_sha1;

  if ( $sha1 eq $calculated_sha1 ) {
    print "... Match!\n";
  }
  else {
    die "\n!!! Did NOT match SHA1 from ExifTool website: $sha1 !!!\n";
  }

  return;
}

sub extract_source_code {
  my $gzip_filename = shift;

  print "Extracting source code archive: $gzip_filename\n";
  my @command = (
    'tar', '--cd', DOWNLOADS_WORKING_DIR, '-xzf',
    DOWNLOADS_WORKING_DIR . "/$gzip_filename"
  );
  system(@command) == 0 or die "system @command failed: $?";

  return;
}

sub extract_windows_exe {
  my $zip_filename = shift;

  my @command = (
    'unzip', '-d', DOWNLOADS_WORKING_DIR, '-o',
    DOWNLOADS_WORKING_DIR . "/$zip_filename"
  );
  system(@command) == 0 or die "system @command failed: $?";

  return;
}

# The Unix version of ExifTool only needs `exiftool` and the `lib` dir.
# In order to keep package size down we only copy these over to the
# ExifCleaner bin dir.
sub move_unix_binary {
  my $code_archive_filename = shift;

  my ($code_dir_name) = $code_archive_filename =~ /^(.+)[.]tar[.]gz$/;

  my $from_dir = DOWNLOADS_WORKING_DIR . "/$code_dir_name";

  # move lib dir
  my @command = ( 'mv', "$from_dir/lib", BIN_DIR_UNIX );
  print join( ' ', @command ) . "\n";
  system(@command) == 0 or die "system @command failed: $?";

  # move `exiftool` base Perl file
  @command = ( 'mv', "$from_dir/exiftool", BIN_DIR_UNIX );
  print join( ' ', @command ) . "\n";
  system(@command) == 0 or die "system @command failed: $?";

  return;
}

# The Windows ExifTool binary is just an .exe file. We have to
# rename it from `exiftool(-k).exe` to `exiftool.exe` and move
# it to the ExifCleaner Windows bin dir.
sub move_windows_binary {
  my $from_path = DOWNLOADS_WORKING_DIR . '/exiftool(-k).exe';
  my $to_path   = BIN_DIR_WINDOWS . '/exiftool.exe';

  my @command = ( 'mv', $from_path, $to_path );
  system(@command) == 0 or die "system @command failed: $?";

  return;
}

sub run {
  print "\n";
  print "---------------------------------------------\n";
  print "Fetching ExifTool SHA1 checksums from website\n";
  print "---------------------------------------------\n";
  my $checksum_file_text = get_checksum_file_text();
  my ( $code_filename, $code_sha1 ) = get_code_zip_info($checksum_file_text);
  my ( $windows_filename, $windows_sha1 ) =
    get_windows_exe_info($checksum_file_text);

  print "\n";
  print "------------------------------------\n";
  print "ExifTool SHA1 checksums from website\n";
  print "------------------------------------\n";
  print "$code_filename - $code_sha1\n";
  print "$windows_filename - $windows_sha1\n";

  # create working dir
  make_downloads_working_dir();

  # download files
  print "\n";
  print "-----------------\n";
  print "Downloading files\n";
  print "-----------------\n";
  download_file($code_filename);
  download_file($windows_filename);

  # verify checksums
  print "-----------------------\n";
  print "Verifying SHA1 checksums\n";
  print "-----------------------\n";
  verify_checksum( $code_filename,    $code_sha1 );
  verify_checksum( $windows_filename, $windows_sha1 );

  print "\n";
  print "-------------------\n";
  print "Extracting archives\n";
  print "-------------------\n";
  extract_source_code($code_filename);
  extract_windows_exe($windows_filename);

  print "\n";
  print "---------------\n";
  print "Moving binaries\n";
  print "---------------\n";
  move_unix_binary($code_filename);
  move_windows_binary();

  return;
}

run();

1;
